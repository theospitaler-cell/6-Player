# 🎉 PartyPlay 6 (Arbeitstitel)

Minispiel-Sammlung für **bis zu 6 Spieler** – jeder spielt auf **seinem eigenen Handy** (Android & iPhone), im **Querformat**.
Vorbild: „2 3 4 Player Games“. Reine Web-App (PWA): HTML + JavaScript + Canvas, kein Build-Schritt, keine Installation.

**Stand: Etappe 1** – Fundament + online spielbar.

## 📱 In 10 Minuten mit den Geschwistern spielen (alles nur mit dem Handy)

### 1. App ins Internet stellen (GitHub Pages, kostenlos)
1. Im Handy-Browser `github.com` öffnen → Repository **6-Player** → **Settings** → links **Pages**
   (Tipp: im Browser-Menü „Desktop-Version“ aktivieren, falls Settings fehlt).
2. **Source: Deploy from a branch** → **Branch: `ccr-0f132161-ybul8b`**, Ordner **/ (root)** → **Save**.
3. Nach ca. 1 Minute läuft die App unter **https://theospitaler-cell.github.io/6-Player/**
4. Link an alle schicken. Auf dem Handy „Zum Home-Bildschirm hinzufügen“ → fühlt sich an wie eine App (Vollbild).

> Später, wenn der Branch in `main` gelandet ist: Pages auf Branch `main` umstellen.

### 2. Online-Party einrichten (Firebase, kostenlos, einmalig)
In der App: **Optionen → „Online-Party einrichten“** – dort steht die Schritt-für-Schritt-Anleitung auf Deutsch
(Projekt anlegen → Anonyme Anmeldung → Realtime Database (Europa) → Regeln einfügen (mit „Kopieren“-Knopf) → Web-App registrieren → Konfiguration einfügen).
Die Regeln stehen auch in `core/firebase.js` (`RTDB_RULES`).

Danach in der App unter Einrichtung **„Einrichtungs-Link teilen“** – ein Tipp darauf auf den anderen Handys übernimmt die Verbindung automatisch.
(Alternative: die Konfiguration oben in `core/firebase.js` eintragen und speichern – dann gilt sie für alle.)

### 3. Spielen
**Party erstellen** → 4-stelliger Code (oder Einladungslink / QR) → Geschwister **Party beitreten** → „Bereit“ → Admin startet.
Ohne Firebase läuft die App im **Demo-Modus** (nur dieses Gerät, mit Bots) – **Solo-Training** geht immer.

## ✅ Was in Etappe 1 drin ist
- PWA (Manifest, Icons, Service Worker „Netzwerk zuerst“), **fest im Querformat** (im Hochformat erscheint „Handy quer halten“), Bildschirm bleibt an (Wake Lock)
- Firebase Realtime Database + anonyme Anmeldung, Verbindungsstatus, Serverzeit-Abgleich; automatischer **Demo-Modus** ohne Firebase
- Transport-Schicht: `FirebaseTransport` und `LocalTransport` (gleiche Schnittstelle, Spielcode kennt nur diese)
- Lobby: Party-Code, Deep-Link `?code=1234`, Teilen, QR, Avatar/Farbe (jede Farbe nur einmal), Bereit, Bots (3 Stärken), Admin-Werkzeuge (Admin übertragen, Spieler entfernen)
- Robustheit: `onDisconnect`, Reconnect („Zurück zur Party?“), **Admin-Wechsel** nach 6 s (auch mitten im Spiel → Runde startet mit neuem Countdown neu), Bot übernimmt bei Verbindungsverlust, Aufräumen alter Räume
- Party-Ablauf: Spielauswahl (**Admin wählt / Abstimmung / Zufall mit Slot-Animation**), Intro, synchroner 3-2-1-Countdown, Spiel, Ergebnis, Zwischenstand, **Siegerehrung** mit Podest, Konfetti und Auszeichnungen
- Punkte: Cup (n−p+1, Gleichstand-Regel), Teams, **Duell-Wertung**, doppelte Punkte im Finale, **Stechen im Schnellzieher** bei Gleichstand
- Einstellungen (live für alle sichtbar, nur Admin ändert): Spielauswahl, Cup/Freies Spiel, Runden 3/5/7/10, „jedes Spiel nur einmal“, Teams, Bots auffüllen, Bot-Stärke, Bot-Übernahme, Spielzeit, Finale ×2, Spiele-Pool
- Level, XP, Münzen (nur auf dem Gerät), Profil, Spiele-Bibliothek
- 6 Spiele (decken alle Sync-Arten ab): 🏁 Tipp-Rennen · ⚡ Schnellzieher · 🪢 Tauziehen (Teams) · 🥊 Arena-Schubser (Joystick + Dash) · 🧠 Mathe-Blitz · ❌ Tic-Tac-Toe (Duell)

## 🧩 Neues Spiel hinzufügen
1. Datei `games/<id>.js` anlegen (Vorlage: ein vorhandenes Spiel; Pflichtfelder siehe `tests/game-logic.test.mjs`, Test „Registry“).
2. In `games/registry.js` importieren und in `GAMES` eintragen. Fertig – Auswahl, Abstimmung, Wertung, Bots, Pool-Einstellungen funktionieren automatisch.

Sync-Arten: `host` (Admin simuliert, ~15 Hz Snapshots, Clients interpolieren) · `local` (jeder spielt sein Feld mit gleichem Seed, meldet Ergebnis) · `turns` (Admin prüft Züge).

## 🧪 Tests
```
npm test        # Punktelogik + Spiel-/Host-Logik (Node, ohne Browser)
```
Zusätzlich wurde Etappe 1 im Headless-Chromium (Handy-Format) mit mehreren „Handys“ getestet – lokal und online mit dem echten Firebase-SDK gegen den Realtime-Database-Emulator **mit genau den Regeln aus `core/firebase.js`**.

## 🔧 Abweichungen / Hinweise
- Musik, Sound und Vibration sind **Geräte-Einstellungen** (Optionen), nicht Party-Einstellungen – jeder will seine eigene Lautstärke.
- Der Prompt war nach Abschnitt 9 abgeschnitten; den Etappenplan (Abschnitt 14) kannte ich nicht, daher die Aufteilung unten.
- Der Tipp-Button (Tippspiele) kann in den Optionen links oder rechts liegen.
- Spieler-Vorhersage (Client-Prediction) ist noch nicht drin – die Steuerung nutzt 100 ms Interpolation.

## 🗺️ Vorschlag für die nächsten Etappen
2. Mehr Spiele (Arena, Rennen, Sport, Geschick; Farb-Gedächtnis; AIM/SWIPE/TILT/DRAW-Steuerungen)
3. Shop & Skins, Erfolge, Missionen, Highscores im Solo-Training
4. Freunde, Presence, Einladungen
5. K.-o.-Duell-Turnier mit Bracket, Themen-Cups, Spiele-Pool-Presets
