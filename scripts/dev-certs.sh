#!/usr/bin/env bash
#
# Membuat sertifikat development (CA lokal + sertifikat server) untuk menguji
# Notula lewat HTTPS dari HP di LAN yang sama.
#
# Kenapa wajib: `getUserMedia` (microphone) HANYA tersedia di secure context.
# `http://<ip-lan>:4173` BUKAN secure context → `navigator.mediaDevices`
# tidak ada → perekaman tidak bisa jalan sama sekali.
#
# Pemakaian:
#   npm run certs                # buat/segarkan sertifikat
#   npm run preview:https        # sajikan dist di https://<ip>:4173
#   lalu pasang certs/dev-ca.pem di HP (lihat docs/DEV-HTTPS.md)
#
# Sertifikat & kunci hanya untuk pengembangan, JANGAN pernah dipakai produksi,
# dan sudah masuk .gitignore.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="$ROOT/certs"
mkdir -p "$CERT_DIR"

DAYS_CA=3650
DAYS_LEAF=825

# Semua IPv4 yang terdeteksi di mesin ini + loopback (SAN wajib cocok persis).
mapfile -t AUTO_IPS < <(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)
IPS=(127.0.0.1)
for ip in "${AUTO_IPS[@]:-}"; do
  [ -n "$ip" ] && IPS+=("$ip")
done
# IP tambahan dari luar, mis. NOTULA_EXTRA_IPS="10.0.0.5,192.168.1.50"
if [ -n "${NOTULA_EXTRA_IPS:-}" ]; then
  IFS=',' read -ra extra <<< "$NOTULA_EXTRA_IPS"
  IPS+=("${extra[@]}")
fi

HOST_NAME="$(hostname 2>/dev/null || echo notula)"
echo "SAN DNS: localhost, ${HOST_NAME}"
echo "SAN IP : ${IPS[*]}"

# ---------------------------------------------------------------- CA --------
if [ ! -f "$CERT_DIR/dev-ca.pem" ]; then
  echo "→ Membuat CA development…"
  openssl genrsa -out "$CERT_DIR/dev-ca-key.pem" 2048 2>/dev/null
  openssl req -x509 -new -key "$CERT_DIR/dev-ca-key.pem" -sha256 -days "$DAYS_CA" \
    -subj "/C=ID/O=Notula Dev/CN=Notula Dev Local CA" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -out "$CERT_DIR/dev-ca.pem" 2>/dev/null
else
  echo "→ CA sudah ada, dipakai ulang."
fi

# ------------------------------------------------------------ server ---------
echo "→ Membuat sertifikat server…"
openssl genrsa -out "$CERT_DIR/dev-key.pem" 2048 2>/dev/null

# OpenSSL memakai format satu baris, dipisah koma (bukan per baris).
SAN_ENTRIES="DNS.1:localhost,DNS.2:${HOST_NAME},DNS.3:notula.local,DNS.4:notula.test"
n=1
for ip in "${IPS[@]}"; do
  SAN_ENTRIES+=",IP.${n}:${ip}"
  n=$((n + 1))
done

cat > "$CERT_DIR/san.cnf" <<EOF
[req]
distinguished_name = dn
prompt             = no

[dn]
C  = ID
O  = Notula Dev
CN = ${HOST_NAME}

[ext]
subjectAltName      = ${SAN_ENTRIES}
basicConstraints    = critical,CA:FALSE
keyUsage            = critical,digitalSignature,keyEncipherment
extendedKeyUsage    = serverAuth
EOF

openssl req -new -key "$CERT_DIR/dev-key.pem" -config "$CERT_DIR/san.cnf" \
  -out "$CERT_DIR/dev.csr" 2>/dev/null
openssl x509 -req -in "$CERT_DIR/dev.csr" \
  -CA "$CERT_DIR/dev-ca.pem" -CAkey "$CERT_DIR/dev-ca-key.pem" -CAcreateserial \
  -days "$DAYS_LEAF" -sha256 -extfile "$CERT_DIR/san.cnf" -extensions ext \
  -out "$CERT_DIR/dev.pem" 2>/dev/null
rm -f "$CERT_DIR/dev.csr"

echo "→ Verifikasi rantai…"
openssl verify -CAfile "$CERT_DIR/dev-ca.pem" "$CERT_DIR/dev.pem"
echo
echo "Selesai. File:"
echo "  CA (pasang di HP) : $CERT_DIR/dev-ca.pem"
echo "  Server cert       : $CERT_DIR/dev.pem"
echo "  Server key        : $CERT_DIR/dev-key.pem"
echo
echo "Jalankan: npm run preview:https"
