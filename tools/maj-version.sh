#!/bin/sh
# Met à jour le numéro ?v= de tous les scripts / styles dans index.html (à lancer après toute modification de assets/js ou assets/css).
V=${1:-$(date -u +%Y%m%d%H%M)}
sed -i -E "s/(assets\/(js|css)\/[A-Za-z0-9_\/-]+\.(js|css)\?v=)[0-9]+/\1$V/g" "$(dirname "$0")/../index.html"
echo "?v=$V"
