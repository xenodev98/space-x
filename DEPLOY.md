# Héberger gratuitement (Oracle Cloud Always Free + DuckDNS)

1. **Compte Oracle Cloud** (cloud.oracle.com) : inscription gratuite, une carte bancaire est demandée pour vérifier l'identité.
2. **Créer la machine** : Compute > Instances > Create. Image Ubuntu 22.04 ou 24.04. Choisis une forme marquée « Always Free Eligible »
   (VM.Standard.E2.1.Micro ou Ampere A1). Télécharge la clé SSH proposée.
3. **Ouvrir les ports** : dans le réseau de l'instance (VCN > Security List), ajoute deux règles d'entrée TCP : ports **80** et **443**, source 0.0.0.0/0.
4. **Nom de domaine gratuit** : duckdns.org, crée un sous-domaine et mets l'IP publique de ta machine dedans.
5. **Envoyer le projet** (depuis ton PC) : `scp -i ta-cle.key modbot.zip ubuntu@IP:~` puis sur la machine : `unzip modbot.zip && cd modbot`.
6. `cp .env.example .env && nano .env` : remplis les valeurs avec `BASE_URL=https://ton-sous-domaine.duckdns.org`.
7. Dans le portail Discord, OAuth2 > Redirects : ajoute `https://ton-sous-domaine.duckdns.org/callback`.
8. `sudo bash deploy.sh ton-sous-domaine.duckdns.org`

Le bot et le dashboard redémarrent seuls après un plantage ou un reboot. Sauvegarde de temps en temps le fichier `data.db` (tes sanctions et réglages).
Mise à jour du code : remplace les fichiers puis `sudo systemctl restart modbot`.
