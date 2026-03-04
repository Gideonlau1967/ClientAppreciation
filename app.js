// SUPABASE CONFIGURATION
// Replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://nsubomswzbwoplijfweu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdWJvbXN3emJ3b3BsaWpmd2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MTkwMjAsImV4cCI6MjA4ODA5NTAyMH0.CQvhWrD823T5uX8q56c5ss71_krt-hmcnOPtYrVGJoA';

const supabaseClient = window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

document.addEventListener('DOMContentLoaded', () => {
    const guestForm = document.getElementById('guest-form');
    const listBranch1 = document.getElementById('guest-list-branch1');
    const listZenith = document.getElementById('guest-list-zenith');
    const listCompass = document.getElementById('guest-list-compass');
    const listAcorn = document.getElementById('guest-list-acorn');

    const emptyBranch1 = document.getElementById('empty-state-branch1');
    const emptyZenith = document.getElementById('empty-state-zenith');
    const emptyCompass = document.getElementById('empty-state-compass');
    const emptyAcorn = document.getElementById('empty-state-acorn');

    const totalGuestsDisplay = document.getElementById('total-guests');
    const maxGuestsDisplay = document.getElementById('max-guests');
    const availableSlotsDisplay = document.getElementById('available-slots');

    const totalBranch1Display = document.getElementById('total-branch1');
    const totalZenithDisplay = document.getElementById('total-zenith');
    const totalCompassDisplay = document.getElementById('total-compass');
    const totalAcornDisplay = document.getElementById('total-acorn');

    let guests = [];
    let isSupabaseOnline = false;

    // Check if Supabase is configured
    if (!supabaseClient || SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL') {
        console.warn("Supabase not configured. Falling back to local mode.");
        isSupabaseOnline = false;
        guests = JSON.parse(localStorage.getItem('guest-list')) || [];
        updateUI(false);
    } else {
        fetchSupabaseData();
    }

    async function fetchSupabaseData(skipRealtime = false) {
        console.log('Fetching data from Supabase...');
        try {
            const { data, error } = await supabaseClient
                .from('guests')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching data:', error);
                isSupabaseOnline = false;
                // Fallback to local if server is down or table is missing
                guests = JSON.parse(localStorage.getItem('guest-list')) || [];
            } else {
                isSupabaseOnline = true;
                guests = data;
                console.log(`Loaded ${guests.length} guests.`);
                // Backup to local storage for offline view
                localStorage.setItem('guest-list', JSON.stringify(guests));
                if (!skipRealtime) setupRealtime();
            }
        } catch (e) {
            console.error('Supabase initialization failed:', e);
            isSupabaseOnline = false;
            guests = JSON.parse(localStorage.getItem('guest-list')) || [];
        }
        updateUI(false);
    }

    // Realtime Updates: Guard against multiple subscriptions
    let realtimeChannel = null;
    function setupRealtime() {
        if (realtimeChannel || !supabaseClient) return;

        console.log('Setting up realtime subscription...');
        realtimeChannel = supabaseClient
            .channel('public:guests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, (payload) => {
                console.log('Realtime update received:', payload.eventType);
                fetchSupabaseData(true); // Fetch but don't try to setup realtime again
            })
            .subscribe((status) => {
                console.log('Realtime status:', status);
                if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    realtimeChannel = null;
                }
            });
    }

    // Single Select Checkbox Logic
    const groupCheckboxes = document.querySelectorAll('.group-checkbox');
    groupCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            if (this.checked) {
                groupCheckboxes.forEach(cb => {
                    if (cb !== this) cb.checked = false;
                });
            }
        });
    });

    // Dynamic Guest List Logic
    const setupSection = document.getElementById('setup-guest-section');
    const dynamicSection = document.getElementById('dynamic-guests-section');
    const dynamicContainer = document.getElementById('dynamic-guests-container');
    const listGuestCount = document.getElementById('list-guest-count');
    const btnCreateList = document.getElementById('btn-create-guest-list');
    const btnResetList = document.getElementById('btn-reset-list');
    const btnSubmitGuests = document.getElementById('btn-submit-guests');

    btnCreateList.addEventListener('click', () => {
        const count = parseInt(listGuestCount.value) || 1;
        dynamicContainer.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'dynamic-guest-name';
            input.placeholder = `Guest ${i} Name`;
            input.required = true;
            input.style.marginBottom = '10px';

            dynamicContainer.appendChild(input);
        }
        setupSection.style.display = 'none';
        dynamicSection.style.display = 'flex';
        btnSubmitGuests.style.display = 'flex';

        const firstInput = dynamicContainer.querySelector('input');
        if (firstInput) firstInput.focus();
    });

    btnResetList.addEventListener('click', () => {
        setupSection.style.display = 'flex';
        dynamicSection.style.display = 'none';
        dynamicContainer.innerHTML = '';
        btnSubmitGuests.style.display = 'none';
    });

    // Form Submission
    guestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const advisorInput = document.getElementById('advisor-name');

        // Collect dynamic names
        const guestNameInputs = document.querySelectorAll('.dynamic-guest-name');
        if (guestNameInputs.length === 0) {
            alert('Please create a guest list first.');
            return;
        }

        let allValid = true;
        const guestNames = [];
        guestNameInputs.forEach(input => {
            const val = input.value.trim();
            if (!val) allValid = false;
            else guestNames.push(val);
        });

        if (!allValid) {
            alert('Please fill in all guest names.');
            return;
        }

        const count = guestNames.length;
        const guest_name = guestNames.join(', ');

        const checkedGroup = document.querySelector('.group-checkbox:checked');
        const group = checkedGroup ? checkedGroup.value : 'Unassigned';

        const name = advisorInput.value.trim();

        if (name && guest_name && count > 0) {
            // 1. Create the guest object (Optimistic)
            const tempId = 'temp-' + Date.now();
            const newGuest = {
                id: tempId,
                name,
                guest_name,
                count,
                group,
                created_at: new Date().toISOString()
            };

            // 2. Update UI Immediately (Optimistic Update)
            guests.unshift(newGuest);
            updateUI(true);

            // 3. Reset form for better UX
            advisorInput.value = '';
            listGuestCount.value = '1';
            groupCheckboxes.forEach(cb => cb.checked = false);
            setupSection.style.display = 'flex';
            dynamicSection.style.display = 'none';
            dynamicContainer.innerHTML = '';
            btnSubmitGuests.style.display = 'none';
            advisorInput.focus();

            // 4. Cloud Synchronization
            if (isSupabaseOnline) {
                try {
                    const { data, error } = await supabaseClient
                        .from('guests')
                        .insert([{ name, guest_name, count, group }])
                        .select();

                    if (error) {
                        console.error('Save failed:', error);
                        alert('Guest saved locally, but failed to sync to cloud: ' + error.message);
                    } else if (data && data[0]) {
                        // Replace temp record with real server record to get the correct ID
                        const index = guests.findIndex(g => g.id === tempId);
                        if (index !== -1) {
                            guests[index] = data[0];
                            // No need to call updateUI here if realtime is active, 
                            // but good for immediate ID consistency
                            updateUI(true);
                        }
                    }
                } catch (err) {
                    console.error('Connection error during sync:', err);
                }
            }
        }
    });

    // Event Delegation for Actions
    // Need to listen on ALL guest lists since they are now separated
    const lists = [listBranch1, listZenith, listCompass, listAcorn];

    lists.forEach(list => {
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.guest-item');
            if (!item) return;

            const btnIncrease = e.target.closest('.btn-increase');
            const btnDecrease = e.target.closest('.btn-decrease');
            const btnDelete = e.target.closest('.btn-delete');

            if (!btnIncrease && !btnDecrease && !btnDelete) return;

            e.preventDefault();
            e.stopPropagation();

            const guestId = item.dataset.id;
            const guestIndex = guests.findIndex(g => String(g.id) === String(guestId));

            if (guestIndex === -1) {
                console.warn(`Guest with ID ${guestId} not found in state.`);
                return;
            }

            if (btnDelete) {
                deleteGuest(guestId, guestIndex);
            } else if (btnIncrease) {
                updateGuestCount(guestId, 1);
            } else if (btnDecrease) {
                updateGuestCount(guestId, -1);
            }
        });
    });

    async function deleteGuest(id, index) {
        // Optimistic Delete (No more prompt)
        const guestToDelete = guests[index];
        guests.splice(index, 1);
        updateUI(true);

        if (isSupabaseOnline && !String(id).startsWith('temp-')) {
            try {
                const { error } = await supabaseClient
                    .from('guests')
                    .delete()
                    .eq('id', id);

                if (error) {
                    console.error('Delete failed:', error);
                    alert('Failed to delete from cloud. It will reappear on next refresh.');
                    // Revert if critical
                    guests.splice(index, 0, guestToDelete);
                    updateUI(true);
                }
            } catch (err) {
                console.error('Delete connection error:', err);
            }
        }
    }

    async function updateGuestCount(id, delta) {
        const guestIndex = guests.findIndex(g => String(g.id) === String(id));
        if (guestIndex === -1) return;

        const guest = guests[guestIndex];
        const newCount = Math.max(1, guest.count + delta);

        if (newCount === guest.count) return;

        // Optimistic Update
        const oldGuest = { ...guest };
        guests[guestIndex] = { ...guest, count: newCount };
        updateUI(true);

        if (isSupabaseOnline && !String(id).startsWith('temp-')) {
            try {
                const { error } = await supabaseClient
                    .from('guests')
                    .update({ count: newCount })
                    .eq('id', id);

                if (error) {
                    console.error('Update failed:', error);
                    guests[guestIndex] = oldGuest; // Revert
                    updateUI(true);
                }
            } catch (err) {
                console.error('Update connection error:', err);
                guests[guestIndex] = oldGuest; // Revert
                updateUI(true);
            }
        }
    }

    // Data management features removed per user request

    // Final UI Rendering
    function updateUI(saveLocal = true) {
        renderGuests();
        updateStats();
        if (saveLocal) {
            localStorage.setItem('guest-list', JSON.stringify(guests));
        }
    }

    function generateGuestHTML(guest) {
        const guestNameDisplay = guest.guest_name ? escapeHTML(guest.guest_name) : 'Guest';
        return `
            <li class="guest-item" data-id="${guest.id}">
                <div class="guest-info">
                    <span class="name">${guestNameDisplay}</span>
                    <span class="advisor">Invited by: ${escapeHTML(guest.name)}</span>
                    <span class="count">${guest.count} ${guest.count === 1 ? 'person' : 'people'}</span>
                </div>
                <div class="guest-actions">
                    <button type="button" class="btn-icon btn-decrease" title="Decrease Count">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <span class="count-display">${guest.count}</span>
                    <button type="button" class="btn-icon btn-increase" title="Increase Count">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                    <button type="button" class="btn-icon btn-delete" title="Delete Guest">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </li>
        `;
    }

    function renderGuests() {
        const branch1Guests = guests.filter(g => g.group === 'Branch 1');
        const zenithGuests = guests.filter(g => g.group === 'Zenith');
        const compassGuests = guests.filter(g => g.group === 'Compass');
        const acornGuests = guests.filter(g => g.group === 'Acorn');

        if (branch1Guests.length === 0) {
            listBranch1.innerHTML = '';
            emptyBranch1.style.display = 'block';
        } else {
            emptyBranch1.style.display = 'none';
            listBranch1.innerHTML = branch1Guests.map(generateGuestHTML).join('');
        }

        if (zenithGuests.length === 0) {
            listZenith.innerHTML = '';
            emptyZenith.style.display = 'block';
        } else {
            emptyZenith.style.display = 'none';
            listZenith.innerHTML = zenithGuests.map(generateGuestHTML).join('');
        }

        if (compassGuests.length === 0) {
            listCompass.innerHTML = '';
            emptyCompass.style.display = 'block';
        } else {
            emptyCompass.style.display = 'none';
            listCompass.innerHTML = compassGuests.map(generateGuestHTML).join('');
        }

        if (acornGuests.length === 0) {
            listAcorn.innerHTML = '';
            emptyAcorn.style.display = 'block';
        } else {
            emptyAcorn.style.display = 'none';
            listAcorn.innerHTML = acornGuests.map(generateGuestHTML).join('');
        }
    }

    function updateStats() {
        const totalGuests = guests.reduce((sum, guest) => sum + guest.count, 0);
        const maxGuests = 50;
        const availableSlots = Math.max(0, maxGuests - totalGuests);

        const branch1Guests = guests.filter(g => g.group === 'Branch 1').reduce((sum, guest) => sum + guest.count, 0);
        const zenithGuests = guests.filter(g => g.group === 'Zenith').reduce((sum, guest) => sum + guest.count, 0);
        const compassGuests = guests.filter(g => g.group === 'Compass').reduce((sum, guest) => sum + guest.count, 0);
        const acornGuests = guests.filter(g => g.group === 'Acorn').reduce((sum, guest) => sum + guest.count, 0);

        animateValue(totalGuestsDisplay, parseInt(totalGuestsDisplay.innerText) || 0, totalGuests, 500);
        animateValue(availableSlotsDisplay, parseInt(availableSlotsDisplay.innerText) || 50, availableSlots, 500);

        animateValue(totalBranch1Display, parseInt(totalBranch1Display.innerText) || 0, branch1Guests, 500);
        animateValue(totalZenithDisplay, parseInt(totalZenithDisplay.innerText) || 0, zenithGuests, 500);
        animateValue(totalCompassDisplay, parseInt(totalCompassDisplay.innerText) || 0, compassGuests, 500);
        animateValue(totalAcornDisplay, parseInt(totalAcornDisplay.innerText) || 0, acornGuests, 500);
    }

    // Search input removed

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }
});
