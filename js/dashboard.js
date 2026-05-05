import { db, auth } from './firebase.js';
import { collection, getDocs, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

let allData = [];
let isAdminVerified = false;
let chartInstance = null;

// 1. Verifikasi Superadmin
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("Mengecek akses admin untuk UID:", user.uid);
        try {
            const adminSnap = await getDoc(doc(db, "admins", user.uid));
            if (adminSnap.exists() && adminSnap.data().role === "superadmin") {
                isAdminVerified = true;
                document.getElementById('adminStatus').classList.remove('hidden');
                console.log("Akses Admin Diberikan.");
            } else {
                console.log("Akses Admin Ditolak. Role bukan superadmin atau tidak terdaftar.");
            }
        } catch (error) {
            console.error("Gagal verifikasi admin. Cek firestore.rules", error);
        }
    }
    loadData(); // Lanjut tarik data setelah cek selesai
});

// 2. Tarik Data
async function loadData() {
    allData = [];
    try {
        const snapMember = await getDocs(collection(db, "laporan_member"));
        snapMember.forEach(d => allData.push({ id: d.id, source: 'laporan_member', ...d.data() }));

        const snapAnonim = await getDocs(collection(db, "laporan_anonim"));
        snapAnonim.forEach(d => allData.push({ id: d.id, source: 'laporan_anonim', ...d.data() }));

        // Urutkan dari yang terbaru (menggunakan timestamp jika ada, jika tidak urutan bebas)
        allData.sort((a, b) => {
            let tA = a.timestamp ? a.timestamp.toMillis() : 0;
            let tB = b.timestamp ? b.timestamp.toMillis() : 0;
            return tB - tA;
        });
        
        updateUI();
    } catch (e) {
        console.error("Error mengambil data laporan:", e);
    }
}

// 3. Filter & Perbarui UI
function updateUI() {
    const filter = document.getElementById('filterTipe').value;
    let dataSaring = allData;
    
    if (filter !== "semua") {
        dataSaring = allData.filter(item => item.source === filter);
    }

    renderKartu(dataSaring);
    renderTabel(dataSaring);
    renderGrafik(dataSaring);
}

document.getElementById('filterTipe').addEventListener('change', updateUI);

// 4. Render Kartu Angka
function renderKartu(data) {
    document.getElementById('totLaporan').innerText = data.length;
    document.getElementById('totBaru').innerText = data.filter(d => d.status === "Baru").length;
    document.getElementById('totSelesai').innerText = data.filter(d => d.status === "Selesai Ditinjau").length;
}

// 5. Render Tabel
function renderTabel(data) {
    const tbody = document.getElementById('tabelLaporan');
    tbody.innerHTML = "";

    const warnaBadge = { 
        "Baru": "text-red-700 bg-red-100 border border-red-200", 
        "Diproses": "text-yellow-700 bg-yellow-100 border border-yellow-200", 
        "Selesai Ditinjau": "text-green-700 bg-green-100 border border-green-200" 
    };

    data.forEach(item => {
        let aksiHTML = '<span class="text-[11px] text-slate-400 italic">Hanya Baca</span>';
        
        // HANYA MUNCUL JIKA ADMIN VERIFIED
        if (isAdminVerified) {
            if (item.status === "Baru") {
                aksiHTML = `<button onclick="ubahStatus('${item.id}', 'Diproses', '${item.source}')" class="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] px-2 py-1.5 rounded transition">Set Diproses</button>`;
            } else if (item.status === "Diproses") {
                aksiHTML = `<button onclick="ubahStatus('${item.id}', 'Selesai Ditinjau', '${item.source}')" class="w-full bg-green-600 hover:bg-green-700 text-white text-[11px] px-2 py-1.5 rounded transition">Set Selesai</button>`;
            } else {
                aksiHTML = '<span class="text-green-600 text-sm">✅ Tuntas</span>';
            }
        }

        const tagSumber = item.source === 'laporan_member' ? 
            '<span class="bg-blue-100 text-blue-700 px-1 rounded">Member</span>' : 
            '<span class="bg-gray-200 text-gray-700 px-1 rounded">Anonim</span>';

        const tr = document.createElement('tr');
        tr.className = "border-b border-slate-100 hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="p-3">
                <div class="font-medium text-slate-800 truncate w-32" title="${item.pelapor}">${item.pelapor}</div>
                <div class="text-[10px] mt-1 text-slate-500">📍 ${item.wilayah} ${tagSumber}</div>
            </td>
            <td class="p-3 text-slate-700">${item.kategori}</td>
            <td class="p-3">
                <span class="px-2 py-1 rounded-full text-[10px] font-bold ${warnaBadge[item.status]}">${item.status}</span>
            </td>
            <td class="p-3 text-center align-middle">${aksiHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 6. Render Grafik (Chart.js)
function renderGrafik(data) {
    const hitungKategori = {};
    data.forEach(item => {
        hitungKategori[item.kategori] = (hitungKategori[item.kategori] || 0) + 1;
    });

    const ctx = document.getElementById('kategoriChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(hitungKategori),
            datasets: [{
                data: Object.values(hitungKategori),
                backgroundColor: ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#64748b']
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: {size: 11} } } } 
        }
    });
}

// 7. Update Status (Database)
window.ubahStatus = async (id, statusBaru, koleksi) => {
    if(!isAdminVerified) return alert("Akses Ditolak! Anda bukan Superadmin.");
    try {
        await updateDoc(doc(db, koleksi, id), { status: statusBaru });
        loadData(); // Refresh tanpa perlu reload browser
    } catch (err) { 
        alert("Gagal update: " + err.message); 
    }
};