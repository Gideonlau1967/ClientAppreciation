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

    // Check if Supabase is configured
    if (!supabaseClient || SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL') {
        console.warn("Supabase not configured. Falling back to local mode.");
        guests = JSON.parse(localStorage.getItem('guest-list')) || [];
        updateUI(false);
    } else {
        fetchSupabaseData();
        setupRealtime();
    }

    async function fetchSupabaseData() {
        const { data, error } = await supabaseClient
            .from('guests')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching data:', error);
            // Fallback to local if server is down
            guests = JSON.parse(localStorage.getItem('guest-list')) || [];
        } else {
            guests = data;
            // Backup to local storage for offline view
            localStorage.setItem('guest-list', JSON.stringify(guests));
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
            if (supabaseClient && SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL') {
                const { error } = await supabaseClient
                    .from('guests')
                    .insert([{ name, count }]);

                if (error) {
                    alert('Error saving to Supabase: ' + error.message);
                } else {
                    // UI will update via Realtime channel!
                    nameInput.value = '';
                    countInput.value = '1';
                    nameInput.focus();
                }
            } else {
                // Local Mode fallback
                const newGuest = { id: Date.now(), name, count, created_at: new Date() };
                guests.unshift(newGuest);
                updateUI(true);
                nameInput.value = '';
                countInput.value = '1';
                nameInput.focus();
            }
        }
    });

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
                <div class="guest-badge">+${guest.count}</div>
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
