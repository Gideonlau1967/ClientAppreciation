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
    const searchInput = document.getElementById('search-guests');
    const exportBtn = document.getElementById('export-txt');
    const importBtn = document.getElementById('import-txt-btn');
    const importInput = document.getElementById('import-txt');

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

    async function fetchSupabaseData() {
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
                // Backup to local storage for offline view
                localStorage.setItem('guest-list', JSON.stringify(guests));
                setupRealtime(); // Only setup realtime if server is responding
            }
        } catch (e) {
            console.error('Supabase initialization failed:', e);
            isSupabaseOnline = false;
            guests = JSON.parse(localStorage.getItem('guest-list')) || [];
        }
        updateUI(false);
    }

    // Realtime Updates: Instantly update UI when other users add guests
    function setupRealtime() {
        supabaseClient
            .channel('public:guests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, (payload) => {
                fetchSupabaseData();
            })
            .subscribe();
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

    // Event Delegation for Edit/Delete
    guestList.addEventListener('click', (e) => {
        const item = e.target.closest('.guest-item');
        if (!item) return;

        const guestId = item.dataset.id;
        const guestIndex = guests.findIndex(g => String(g.id) === String(guestId));
        if (guestIndex === -1) return;

        if (e.target.closest('.btn-delete')) {
            deleteGuest(guestId, guestIndex);
        } else if (e.target.closest('.btn-edit')) {
            editGuest(guestId, guestIndex);
        }
    });

    async function deleteGuest(id, index) {
        if (!confirm('Are you sure you want to delete this guest?')) return;

        // Optimistic Delete
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

    async function editGuest(id, index) {
        const guest = guests[index];
        const newName = prompt('Enter new name:', guest.name);
        if (newName === null) return;

        const newCountStr = prompt('Enter number of people:', guest.count);
        if (newCountStr === null) return;

        const newCount = parseInt(newCountStr);
        if (isNaN(newCount) || newCount < 1) {
            alert('Invalid number of guests.');
            return;
        }

        // Optimistic Update
        const oldGuest = { ...guest };
        guests[index] = { ...guest, name: newName, count: newCount };
        updateUI(true);

        if (isSupabaseOnline && !String(id).startsWith('temp-')) {
            try {
                const { error } = await supabaseClient
                    .from('guests')
                    .update({ name: newName, count: newCount })
                    .eq('id', id);

                if (error) {
                    console.error('Update failed:', error);
                    alert('Update failed on cloud: ' + error.message);
                    guests[index] = oldGuest; // Revert
                    updateUI(true);
                }
            } catch (err) {
                console.error('Update connection error:', err);
            }
        }
    }

    // Export Logic
    exportBtn.addEventListener('click', () => {
        if (guests.length === 0) {
            alert("No guests to export!");
            return;
        }

        const totalGuests = guests.reduce((sum, g) => sum + g.count, 0);
        let content = `GUEST LIST SYSTEM (CLOUDSYNC) - TOTAL GUESTS: ${totalGuests}\n`;
        content += `----------------------------------------\n\n`;

        guests.forEach((g, index) => {
            content += `${index + 1}. ${g.name.padEnd(25)} | People: ${g.count}\n`;
        });

        content += `\nGenerated on: ${new Date().toLocaleString()}\n`;

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `guest-list-sync-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // Import Logic
    importBtn.addEventListener('click', () => importInput.click());

    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const rawData = parseData(event.target.result);
            if (rawData.length > 0) {
                if (confirm(`Add ${rawData.length} guests to the cloud?`)) {
                    if (supabaseClient && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
                        const { error } = await supabaseClient.from('guests').insert(rawData);
                        if (error) alert("Error importing: " + error.message);
                    } else {
                        guests = [...rawData, ...guests];
                        updateUI(true);
                    }
                }
            } else {
                alert("No valid data found in file.");
            }
            importInput.value = '';
        };
        reader.readAsText(file);
    });

    function parseData(text) {
        const results = [];
        const lines = text.split('\n');
        const guestRegex = /^\d+\.\s+(.*?)\s+\|\s+People:\s+(\d+)$/;
        lines.forEach(line => {
            const match = line.trim().match(guestRegex);
            if (match) {
                results.push({ name: match[1].trim(), count: parseInt(match[2]) });
            }
        });
        return results;
    }

    // Final UI Rendering
    function updateUI(saveLocal = true) {
        renderGuests();
        updateStats();
        if (saveLocal) {
            localStorage.setItem('guest-list', JSON.stringify(guests));
        }
    }

    function renderGuests() {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(searchTerm));

        if (filteredGuests.length === 0) {
            guestList.innerHTML = '';
            emptyState.style.display = 'block';
            emptyState.innerHTML = guests.length === 0 ? 'No guests found.' : 'No matches.';
            return;
        }

        emptyState.style.display = 'none';
        guestList.innerHTML = filteredGuests.map(guest => `
            <li class="guest-item" data-id="${guest.id}">
                <div class="guest-info">
                    <span class="name">${escapeHTML(guest.name)}</span>
                    <span class="count">${guest.count} ${guest.count === 1 ? 'person' : 'people'}</span>
                </div>
                <div class="guest-actions">
                    <button class="btn-icon btn-edit" title="Edit Guest">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" title="Delete Guest">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    <div class="guest-badge">+${guest.count}</div>
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

    searchInput.addEventListener('input', renderGuests);

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
