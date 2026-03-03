// SUPABASE CONFIGURATION
// Replace these with your actual Supabase URL and Anon Key
const SUPABASE_URL = 'https://nsubomswzbwoplijfweu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zdWJvbXN3emJ3b3BsaWpmd2V1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1MTkwMjAsImV4cCI6MjA4ODA5NTAyMH0.CQvhWrD823T5uX8q56c5ss71_krt-hmcnOPtYrVGJoA';

const supabaseClient = window.supabase ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

document.addEventListener('DOMContentLoaded', () => {
    const guestForm = document.getElementById('guest-form');
    const guestList = document.getElementById('guest-list');
    const totalGuestsDisplay = document.getElementById('total-guests');
    const totalGroupsDisplay = document.getElementById('total-groups');
    const emptyState = document.getElementById('empty-state');

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

    // Form Submission
    guestForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const nameInput = document.getElementById('guest-name');
        const countInput = document.getElementById('guest-count');

        const name = nameInput.value.trim();
        const count = parseInt(countInput.value);

        if (name && count > 0) {
            // 1. Create the guest object (Optimistic)
            const tempId = 'temp-' + Date.now();
            const newGuest = {
                id: tempId,
                name,
                count,
                created_at: new Date().toISOString()
            };

            // 2. Update UI Immediately (Optimistic Update)
            guests.unshift(newGuest);
            updateUI(true);

            // 3. Reset form for better UX
            nameInput.value = '';
            countInput.value = '1';
            nameInput.focus();

            // 4. Cloud Synchronization
            if (isSupabaseOnline) {
                try {
                    const { data, error } = await supabaseClient
                        .from('guests')
                        .insert([{ name, count }])
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
    guestList.addEventListener('click', (e) => {
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

    function renderGuests() {
        if (guests.length === 0) {
            guestList.innerHTML = '';
            emptyState.style.display = 'block';
            emptyState.innerHTML = 'No guests added yet.';
            return;
        }

        emptyState.style.display = 'none';
        guestList.innerHTML = guests.map(guest => `
            <li class="guest-item" data-id="${guest.id}">
                <div class="guest-info">
                    <span class="name">${escapeHTML(guest.name)}</span>
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
        `).join('');
    }

    function updateStats() {
        const totalGuests = guests.reduce((sum, guest) => sum + guest.count, 0);
        const totalGroups = guests.length;
        animateValue(totalGuestsDisplay, parseInt(totalGuestsDisplay.innerText) || 0, totalGuests, 500);
        animateValue(totalGroupsDisplay, parseInt(totalGroupsDisplay.innerText) || 0, totalGroups, 500);
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
