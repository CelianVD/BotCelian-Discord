import os
import pywikibot

def check_connection():
    print("--- Tentative de connexion ---")
    try:
        site = pywikibot.Site('fr', 'vikidia')
        
        site.login()
        
        if site.logged_in():
            print(f"✅ Connecté en tant que : {site.user()}")
        else:
            print("❌ Échec : Toujours pas connecté.")
            
    except Exception as e:
        if "successful ClientLoginManager.login()" in str(e):
            print("✅ Succès partiel (Erreur de nom ignorée)")
        else:
            print(f"⚠️ Erreur : {e}")

if __name__ == "__main__":
    check_connection()