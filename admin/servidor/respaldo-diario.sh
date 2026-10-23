#!/bin/bash
# Respaldo diario de lo que NO se puede volver a generar: la sesión de WhatsApp
# de cada estudiante (si se pierde, tiene que escanear el QR otra vez) y las
# llaves/fichas del servidor. Lo corre cron todos los días (ver /etc/cron.d/crm-respaldo).
# Guarda en /var/backups/crm/<fecha>/ (solo root puede leerlo) y borra lo de hace más de 7 días.
# Las bases de datos y los archivos están en el Supabase de cada estudiante: no se respaldan acá.
set -uo pipefail
DESTINO="/var/backups/crm/$(date +%Y-%m-%d)"
mkdir -p "$DESTINO"
chmod 700 /var/backups/crm "$DESTINO"

for dir in /srv/crm/*/; do
  n="$(basename "$dir")"
  [ -d "$dir/sesiones" ] || continue
  # Solo si ya tiene una sesión de WhatsApp guardada.
  ls "$dir/sesiones" 2>/dev/null | grep -q . || continue
  tar --warning=no-file-changed -czf "$DESTINO/$n-sesiones.tar.gz" -C "$dir" sesiones 2>/dev/null
done
tar -czf "$DESTINO/admin.tar.gz" /root/llaves /root/fichas /etc/crm /etc/nginx/sites-available 2>/dev/null
chmod 600 "$DESTINO"/*.tar.gz

# Se guardan 7 días.
find /var/backups/crm -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "$(date '+%F %T') respaldo listo en $DESTINO ($(ls "$DESTINO" | wc -l) archivos, $(du -sh "$DESTINO" | cut -f1))"
