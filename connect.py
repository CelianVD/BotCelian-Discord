import os
import pywikibot

def check_connection():
    print("--- Tentative de connexion forcée ---")
    try:
        site = pywikibot.Site('fr', 'vikidia')
        
        # On tente le login
        site.login()
        
        if site.logged_in():
            print(f"✅ ENFIN ! Connecté en tant que : {site.user()}")
        else:
            print("❌ Échec : Toujours pas connecté.")
            
    except Exception as e:
        # Si l'erreur de nom revient, on vérifie quand même si on est logué
        if "successful ClientLoginManager.login()" in str(e):
            print("✅ Succès partiel (Erreur de nom ignorée)")
        else:
            print(f"⚠️ Erreur : {e}")

if __name__ == "__main__":
    check_connection()
