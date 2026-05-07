import { auth, provider, db, storage } from './firebase.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";

const map = L.map('map').setView([-0.9471, 100.3658], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

let markerLaporan;

const btnLokasiRealtime = document.getElementById('btnLokasiRealtime');
btnLokasiRealtime.onclick = () => {
    if (!navigator.geolocation) {
        return Swal.fire("Gagal", "Browser Anda tidak mendukung fitur lokasi.", "error");
    }

    btnLokasiRealtime.innerText = "Mencari...";
    btnLokasiRealtime.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            document.getElementById('lat').value = lat.toFixed(6);
            document.getElementById('lng').value = lng.toFixed(6);
            if (markerLaporan) map.removeLayer(markerLaporan);
            markerLaporan = L.marker([lat, lng]).addTo(map);
            map.setView([lat, lng], 16); 
            btnLokasiRealtime.innerText = "📍 Lokasi Saya";
            btnLokasiRealtime.disabled = false;
        },
        (error) => {
            btnLokasiRealtime.innerText = "📍 Lokasi Saya";
            btnLokasiRealtime.disabled = false;
            let pesanError = "Terjadi kesalahan saat mengambil lokasi.";
            if (error.code === error.PERMISSION_DENIED) pesanError = "Akses lokasi ditolak. Harap izinkan GPS di browser Anda.";
            
            Swal.fire({
                title: "GPS Bermasalah",
                text: pesanError,
                icon: "warning",
                confirmButtonColor: '#1e293b'
            });
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
};

map.on('click', (e) => {
    if (markerLaporan) map.removeLayer(markerLaporan);
    markerLaporan = L.marker(e.latlng).addTo(map);
    document.getElementById('lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('lng').value = e.latlng.lng.toFixed(6);
});

const btnLogin = document.getElementById('btnLogin');
const btnLogout = document.getElementById('btnLogout');
const statusUser = document.getElementById('statusUser');

btnLogin.onclick = () => signInWithPopup(auth, provider);
btnLogout.onclick = () => signOut(auth);

onAuthStateChanged(auth, (user) => {
    if (user) {
        statusUser.innerText = `🟢 Member: ${user.displayName}`;
        btnLogin.classList.add('hidden');
        btnLogout.classList.remove('hidden');
    } else {
        statusUser.innerText = `⚪ Status: Anonim`;
        btnLogin.classList.remove('hidden');
        btnLogout.classList.add('hidden');
    }
});

document.getElementById('formLaporan').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnKirim');
    const user = auth.currentUser;
    const lat = document.getElementById('lat').value;

    if (!lat) {
        return Swal.fire({
            title: "Lokasi Kosong",
            text: "Silakan pilih lokasi kejadian di peta terlebih dahulu!",
            icon: "info",
            confirmButtonColor: '#1e293b'
        });
    }

    btn.disabled = true;
    btn.innerText = "Mengirim...";

    try {
        let urlFoto = "";
        const file = document.getElementById('foto').files[0];
        if (file) {
            const fileRef = ref(storage, `laporan_kriminalitas/${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            urlFoto = await getDownloadURL(fileRef);
        }

        const koleksiTarget = user ? "laporan_member" : "laporan_anonim";
        const emailPelapor = user ? user.email : "Anonim";

        await addDoc(collection(db, koleksiTarget), {
            nama: document.getElementById('nama').value,
            wilayah: document.getElementById('wilayah').value,
            kategori: document.getElementById('kategori').value,
            keterangan: document.getElementById('keterangan').value,
            foto: urlFoto,
            koordinat: { lat: parseFloat(lat), lng: parseFloat(document.getElementById('lng').value) },
            pelapor: emailPelapor,
            status: "Baru",
            timestamp: serverTimestamp()
        });        
       
        Swal.fire({
            title: 'Laporan Terkirim!',
            text: 'Terima kasih, pengaduan Anda berhasil masuk ke sistem GeoReport.',
            icon: 'success',
            iconColor: '#facc15',
            confirmButtonText: 'Selesai',
            confirmButtonColor: '#1e293b'
        }).then(() => {
            location.reload(); 
        });

    } catch (err) {
        console.error(err);
        Swal.fire({
            title: 'Gagal!',
            text: 'Terjadi kesalahan: ' + err.message,
            icon: 'error',
            confirmButtonColor: '#ef4444'
        });
        btn.disabled = false;
        btn.innerText = "Kirim Laporan";
    }
};

async function loadMarkers() {
    try {
        const snapAnonim = await getDocs(collection(db, "laporan_anonim"));
        snapAnonim.forEach(doc => renderMarkerPeta(doc.data()));

        const snapMember = await getDocs(collection(db, "laporan_member"));
        snapMember.forEach(doc => renderMarkerPeta(doc.data()));
    } catch (error) {
        console.error("Gagal memuat marker:", error);
    }
}

function renderMarkerPeta(data) {
    if (data.koordinat && data.koordinat.lat && data.koordinat.lng) {
        let warna = "red"; 
        if (data.status === "Diproses") warna = "orange";
        else if (data.status === "Selesai Ditinjau") warna = "green";

        const iconMarker = L.divIcon({
            className: 'custom-icon',
            html: `<div style="background-color:${warna}; width:18px; height:18px; border-radius:50%; border:2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
            iconSize: [18, 18]
        });

        const marker = L.marker([data.koordinat.lat, data.koordinat.lng], {icon: iconMarker}).addTo(map);

        let popupHTML = `
            <div style="min-width: 200px; font-family: sans-serif;">
                <h3 style="margin: 0; color: #1e293b; font-size: 16px; border-bottom: 2px solid #facc15; padding-bottom: 4px;">
                    ${data.kategori}
                </h3>
                <div style="font-size: 12px; color: #334155; margin-top: 10px; line-height: 1.5;">
                    <p style="margin: 2px 0;"><b>📍 Wilayah:</b> ${data.wilayah}</p>
                    <p style="margin: 2px 0;"><b>👤 Pelapor:</b> ${data.nama || 'Anonim'}</p>
                    <p style="margin: 2px 0;"><b>📝 Ket:</b> ${data.keterangan || '-'}</p>
                    <p style="margin: 8px 0 4px;"><b>Status:</b> 
                        <span style="background: ${warna}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: bold;">
                            ${data.status}
                        </span>
                    </p>
                </div>
        `;
        if (data.foto) {
            popupHTML += `
                <div style="margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
                    <p style="font-size: 10px; font-weight: bold; color: #64748b; margin-bottom: 4px;">Bukti Foto:</p>
                    <img src="${data.foto}" 
                         style="width: 100%; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer;" 
                         alt="Foto Kejadian"
                         onclick="window.open('${data.foto}', '_blank')">
                </div>
            `;
        }

        popupHTML += `</div>`;
        marker.bindPopup(popupHTML);
    }
}

loadMarkers();
