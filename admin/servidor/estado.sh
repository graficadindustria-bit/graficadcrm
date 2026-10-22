#!/bin/bash
# Lista los CRM del servidor: si están corriendo, cuánta memoria usan y qué
# versión tienen publicada. Uso (como root): estado.sh
DOMINIO="$(cat /etc/crm/dominio)"
printf "%-14s %-9s %-8s %-17s %s\n" "ESTUDIANTE" "ESTADO" "MEMORIA" "VERSIÓN" "SITIO"
for base in /srv/crm/*/; do
  n="$(basename "$base")"
  [ -f "$base/puerto" ] || continue
  estado="$(systemctl is-active "crm@$n" 2>/dev/null)"
  mem="$(systemctl show "crm@$n" -p MemoryCurrent --value 2>/dev/null)"
  if [[ "$mem" =~ ^[0-9]+$ ]]; then mem="$((mem / 1024 / 1024))M"; else mem="-"; fi
  version="$(basename "$(readlink -f "$base/actual" 2>/dev/null)" 2>/dev/null)"
  [ -e "$base/actual" ] || version="(sin publicar)"
  printf "%-14s %-9s %-8s %-17s %s\n" "$n" "$estado" "$mem" "$version" "https://$n.$DOMINIO"
done
echo
free -h | head -2
df -h / | tail -1
