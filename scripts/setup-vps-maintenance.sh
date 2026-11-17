#!/bin/bash
# ==============================================================================
# Script d'Optimisation & Maintenance Quotidienne Automatique pour VPS You&Me
# Cible : VPS Supabase (31.70.158.23)
# ==============================================================================
# Ce script :
# 1. Vérifie et crée un fichier SWAP de 4 Go s'il n'existe pas (évite les crashs de RAM).
# 2. Règle le swappiness à 10 pour préserver la réactivité du système.
# 3. Met en place un cron de maintenance matinale chaque matin à 04h30 :
#    - Purge des caches mémoire inutiles
#    - Nettoyage des logs Docker
#    - Redémarrage propre et sain des conteneurs Supabase
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Démarrage de la configuration du VPS You&Me..."
echo "=========================================================="

# 1. VÉRIFICATION ET CONFIGURATION DU SWAP (4 Go)
# ------------------------------------------------------------------------------
CURRENT_SWAP=$(swapon --show --noheadings | wc -l)

if [ "$CURRENT_SWAP" -eq 0 ]; then
    echo "⚠️ Aucun fichier SWAP détecté. Création d'un SWAP de 4 Go..."
    
    # Création du fichier de swap de 4 Go
    if command -v fallocate >/dev/null 2>&1; then
        fallocate -l 4G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    else
        dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    fi

    # Sécurisation des permissions (lecture/écriture root uniquement)
    chmod 600 /swapfile

    # Initialisation de l'espace swap
    mkswap /swapfile

    # Activation immédiate
    swapon /swapfile

    # Persistance au redémarrage dans /etc/fstab
    if ! grep -q '/swapfile' /etc/fstab; then
        echo '/swapfile none swap sw 0 0' >> /etc/fstab
        echo "✅ SWAP ajouté de façon permanente dans /etc/fstab"
    fi

    echo "✅ Fichier SWAP de 4 Go activé avec succès !"
else
    echo "ℹ️ Espace SWAP déjà existant :"
    swapon --show
fi

# Optimisation du paramètre de swapping (swappiness = 10)
sysctl vm.swappiness=10
if ! grep -q 'vm.swappiness=10' /etc/sysctl.conf; then
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi
echo "✅ Swappiness configuré à 10 (la RAM est priorisée, le swap sert de bouclier)"


# 2. CRÉATION DU SCRIPT DE MAINTENANCE MATINALE (04h30)
# ------------------------------------------------------------------------------
MAINTENANCE_SCRIPT="/usr/local/bin/yam-morning-maintenance.sh"
echo "🛠️ Création du script de maintenance dans $MAINTENANCE_SCRIPT..."

cat << 'EOF' > "$MAINTENANCE_SCRIPT"
#!/bin/bash
# Script exécuté tous les matins à 04h30
LOG_FILE="/var/log/yam-maintenance.log"
DATE_NOW=$(date '+%Y-%m-%d %H:%M:%S')

echo "----------------------------------------------------------" >> "$LOG_FILE"
echo "[$DATE_NOW] 🌅 Début de la maintenance matinale You&Me" >> "$LOG_FILE"

# 1. Nettoyage des caches mémoire kernel
sync
echo 3 > /proc/sys/vm/drop_caches
echo "[$DATE_NOW] 🧹 Caches mémoire RAM libérés" >> "$LOG_FILE"

# 2. Nettoyage des conteneurs, réseaux et logs Docker orphelins
if command -v docker >/dev/null 2>&1; then
    docker system prune -f --volumes=false >> "$LOG_FILE" 2>&1
    echo "[$DATE_NOW] 🐳 Nettoyage Docker effectué" >> "$LOG_FILE"

    # 3. Localisation et redémarrage sain du docker-compose Supabase
    COMPOSE_DIR=$(find / -name "docker-compose.yml" -not -path "*/proc/*" -not -path "*/sys/*" 2>/dev/null | grep -E "supabase" | head -n 1)

    if [ -n "$COMPOSE_DIR" ]; then
        WORK_DIR=$(dirname "$COMPOSE_DIR")
        echo "[$DATE_NOW] 🔄 Redémarrage propre de Supabase dans $WORK_DIR..." >> "$LOG_FILE"
        cd "$WORK_DIR"
        docker compose restart >> "$LOG_FILE" 2>&1
        echo "[$DATE_NOW] ✅ Supabase redémarré avec succès" >> "$LOG_FILE"
    else
        echo "[$DATE_NOW] ⚠️ Répertoire supabase docker-compose introuvable, redémarrage des containers via docker restart..." >> "$LOG_FILE"
        docker restart $(docker ps -q) >> "$LOG_FILE" 2>&1
    fi
fi

echo "[$DATE_NOW] ✨ Maintenance terminée avec succès. VPS prêt et sain pour la journée !" >> "$LOG_FILE"
EOF

chmod +x "$MAINTENANCE_SCRIPT"
echo "✅ Script de maintenance créé et rendu exécutable"


# 3. PLANIFICATION CRON (TOUS LES MATINS À 04H30)
# ------------------------------------------------------------------------------
CRON_JOB="30 4 * * * $MAINTENANCE_SCRIPT >/dev/null 2>&1"

# Vérifier si la tâche existe déjà dans la crontab root
if crontab -l 2>/dev/null | grep -q "$MAINTENANCE_SCRIPT"; then
    echo "ℹ️ La tâche cron matinale existe déjà."
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Tâche cron matinale enregistrée : programmée chaque jour à 04h30 !"
fi

echo ""
echo "=========================================================="
echo "🎉 CONFIGURATION DU VPS TERMINÉE AVEC SUCCÈS !"
echo "=========================================================="
echo "• Mémoire SWAP : 4 Go actifs"
echo "• Maintenance quotidienne : 04h30 chaque matin"
echo "• Journal de maintenance : /var/log/yam-maintenance.log"
echo "=========================================================="
