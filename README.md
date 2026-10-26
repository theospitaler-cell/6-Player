# 🎉 PartyPlay 6 (Arbeitstitel)

Minispiel-Sammlung für **bis zu 6 Spieler** – jeder spielt auf **seinem eigenen Handy** (Android & iPhone), im **Querformat**.
Vorbild: „2 3 4 Player Games“. Reine Web-App (PWA): HTML + JavaScript (ES-Module) + Canvas, **kein Build-Schritt**, keine Installation.

**Stand: v1.0** – 38 Spiele, Online-Partys, K.-o.-Turnier, Themen-Cups, Shop, Erfolge, Missionen, Freunde.

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
Die Regeln stehen auch in `core/firebase.js` (`RTDB_RULES`) – **sie enthalten auch die Regeln für Freunde**, einmal einfügen reicht.

Danach in der App unter Einrichtung **„Einrichtungs-Link teilen“** – ein Tipp darauf auf den anderen Handys übernimmt die Verbindung automatisch.
(Alternative: die Konfiguration oben in `core/firebase.js` eintragen und speichern – dann gilt sie für alle.)

### 3. Spielen
**Party erstellen** → 4-stelliger Code (oder Einladungslink / QR / Freunde einladen) → Geschwister **Party beitreten** → „Bereit“ → Admin startet.
Ohne Firebase läuft die App im **Demo-Modus** (nur dieses Gerät, mit Bots) – **Solo-Training** geht immer.

## ✅ Was drin ist

**Spiele (38)** – jedes in einer eigenen Datei unter `games/`:
- 🏁 Rennen: Tipp-Rennen · Rennwagen · Hühner-Hüpfer
- ⚡ Reaktion: Schnellzieher · Takt-Meister · Wisch-Meister
- ⚽ Sport: Tauziehen (Teams) · Fußball · Air-Hockey · Billard · Korbwurf · Elfmeter
- 🥊 Arena: Arena-Schubser · Schlangen-Arena · Panzer-Arena · Heiße Bombe
- 🎯 Geschick: Feuerregen · Sterne-Sammeln · Taube · Treffer-Balken · Ninja-Sterne · Wippe (Neigungssensor) · Maulwurf-Klopfen
- 🧠 Denken: Mathe-Blitz · Farbwort · Farb-Gedächtnis · Quiz-Blitz · Schätz-Meister · Winkel-Schätzen · Wort-Blitz
- ♟️ Brett (Duelle): Tic-Tac-Toe · Vier gewinnt · Schere-Stein-Papier · Mancala · Dame
- 🎉 Party & Koop: Mehrheit · Zeichnen & Raten · Raketenstart

**Steuerungen:** TAP · LR (links/rechts) · Joystick · Joystick+Knopf · Zielen (AIM) · Wischen (SWIPE) · Neigen (TILT, mit Joystick als Ersatz) · Auswahl (PICK) · Zeichnen (DRAW). Alles ohne die Handy-Tastatur (die würde im Querformat den Bildschirm verdecken).

**Party-Ablauf:** Spielauswahl (Admin wählt / Abstimmung / Zufall mit Slot-Animation) → Intro (überspringbar, wenn alle wollen) → synchroner 3-2-1-Countdown → Spiel → Ergebnis → Zwischenstand → Siegerehrung mit Podest, Konfetti und Auszeichnungen.

**Party-Arten:**
- 🏆 **Cup** – Punkte nach Platz (n−p+1, Gleichstand-Regel), Teams, Duell-Wertung, Finale ×2, **Stechen im Schnellzieher** bei Gleichstand
- ⚔️ **K.-o.-Turnier** – Setzliste, Freilose, Best-of-3 (max. 5 Spiele), Bracket-Ansicht zwischen den Matches, Platzierungen
- 🎲 **Freies Spiel** – ohne Punkte, nur spielen
- 🎨 **Themen-Cups** (Schnellstart beim Erstellen): Gemischt · Rennen · Arena · Denken · Sport · Chaos

**Profil & Fortschritt (nur auf dem Gerät):** Level/XP, Münzen (nur durch Spielen – **kein Echtgeld, keine Werbung**), 🛒 **Shop** (27 Figuren in 4 Seltenheiten, 9 Rahmen inkl. Regenbogen), 🏅 25 **Erfolge**, 📅 3 **Tagesmissionen** (abholbar), 🏆 **Highscores** im Solo-Training (zurücksetzbar).

**Freunde:** eigener Freundescode (z. B. `K7M-4PX`) + Link, Anfragen annehmen/ablehnen, Anwesenheit (🟢 online / 🎮 in Party / zuletzt gesehen), direkt in die Party eines Freundes springen, Freunde aus der Lobby **einladen** (Einladung erscheint als Dialog). Braucht die Online-Verbindung.

**Robustheit:** `onDisconnect`, Reconnect („Zurück zur Party?“), **Admin-Wechsel** nach 6 s (auch mitten im Spiel → Runde startet mit neuem Countdown neu), Bot übernimmt bei Verbindungsverlust, Aufräumen alter Räume (> 6 h).

**Technik:** Transport-Schicht (`FirebaseTransport` / `LocalTransport` mit identischer Schnittstelle, der Spielcode kennt nur sie) · automatischer Demo-Modus ohne Firebase · Service Worker „Netzwerk zuerst“ · fest im Querformat (Hochformat zeigt „Handy quer halten“) · Wake Lock.

## 🧩 Neues Spiel hinzufügen
1. Datei `games/<id>.js` anlegen (Vorlage: ein vorhandenes Spiel, z. B. `games/timing.js` für lokale oder `games/panzer.js` für Admin-simulierte Spiele).
2. In `games/registry.js` importieren und in `GAMES` eintragen. Fertig – Auswahl, Abstimmung, Wertung, Bots, Pool, Themen-Cups, K.-o.-Duelle und Bibliothek funktionieren automatisch.
3. `npm test` prüft Pflichtfelder, spielt das Spiel mit 2–6 Spielern durch und meldet NaN/ungültige Canvas-Aufrufe.

Sync-Arten: `host` (Admin simuliert, ~15 Hz Snapshots, Clients interpolieren) · `local` (jeder spielt sein Feld mit gleichem Seed, meldet das Ergebnis) · `turns` (Admin prüft Züge).

## 🧪 Tests
```
npm test        # Punktelogik, Spiel-/Host-Logik, K.-o., Fortschritt, Freunde, Rauchtest aller 38 Spiele (Node, ohne Browser)
```
Zusätzlich wurde im Headless-Chromium (Handy-Format 844×390) getestet: jedes Spiel über die echte Oberfläche, mehrere „Handys“ lokal und **online mit dem echten Firebase-SDK gegen den Realtime-Database-Emulator – mit genau den Regeln aus `core/firebase.js`** (Party, Admin-Wechsel, Freunde inkl. verbotener Zugriffe).

## 🔧 Abweichungen / Hinweise
- Musik, Sound und Vibration sind **Geräte-Einstellungen** (Optionen), nicht Party-Einstellungen – jeder will seine eigene Lautstärke.
- Der Prompt war nach Abschnitt 9 abgeschnitten; die Abschnitte 10–14 (u. a. Etappenplan) kannte ich nicht. Alles aus Abschnitt 0–9 ist umgesetzt; Details, die dort offen waren (Preise im Shop, Erfolge, Missionen, Themen-Cups, Spiele-Auswahl), habe ich selbst festgelegt.
- Der Tipp-Button (Tippspiele) kann in den Optionen links oder rechts liegen.
- Es gibt keine Client-Vorhersage (Prediction): Admin-simulierte Spiele nutzen eine adaptive Interpolation – bei schlechtem Netz wirkt die eigene Figur etwas verzögert.
- Zeichnen & Raten braucht mindestens 2 echte Spieler (Bots können nicht zeichnen).
- Auf dem iPhone ist Vollbild/Querformat-Sperre nur nach „Zum Home-Bildschirm“ möglich; Neigungssensor muss dort einmal per Knopf erlaubt werden.
