#pragma once

// ---------------------------------------------------------------------------
// Vorlage. Kopieren nach include/geheimnisse.h und ausfuellen.
// geheimnisse.h steht in .gitignore und gehoert nicht ins Repository.
//
// Beide Werte stehen im Web-Backend unter "Sensoren -> Gerät aufnehmen" -
// der Schluessel wird dort genau einmal angezeigt.
// ---------------------------------------------------------------------------

#define GERAETE_ID   "ALT-0001"

// 64 Hex-Zeichen (32 Byte). Leer lassen, wenn sich das Geraet den Schluessel
// beim ersten Start selbst abholen soll - dann muss GERAETE_PROVISIONIERUNG
// gesetzt sein.
#define GERAETE_KEY  ""

// Gemeinsamer Werksschluessel fuer die Erstinbetriebnahme (TOFU).
// Entspricht GERAETE_PROVISIONIERUNG_SCHLUESSEL im Backend.
#define GERAETE_PROVISIONIERUNG ""
