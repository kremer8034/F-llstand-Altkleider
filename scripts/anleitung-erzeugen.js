/**
 * Erzeugt docs/Sensor-Bauanleitung.docx
 *
 *   npm run anleitung
 *
 * Quelle der Wahrheit für Pinbelegung und Voreinstellungen ist
 * firmware/altkleider-sensor/include/konfiguration.h - bei Änderungen dort
 * dieses Skript nachziehen und das Dokument neu erzeugen.
 */

const B = require("./docx-bausteine.js");
const {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, LevelFormat,
  PageBreak, PageNumber, Packer, Paragraph, TextRun,
  h1, h2, h3, p, pm, punkte, code, kasten, abstand, tabelle, fs, path, FARBE,
} = B;

const ADRESSE = "f-llstand-altkleider.vercel.app";
const REPO = "https://github.com/kremer8034/F-llstand-Altkleider";

const inhalt = [];
const füge = (...teile) => inhalt.push(...teile.flat());

// ======================================================================
// Deckblatt
// ======================================================================
füge(
  abstand(1400),
  new Paragraph({
    spacing: { after: 100 },
    children: [
      new TextRun({ text: "BRK KREISVERBAND MILTENBERG", bold: true, size: 19, color: FARBE.leise }),
    ],
  }),
  new Paragraph({
    spacing: { after: 160 },
    children: [new TextRun({ text: "Füllstandsensor selbst bauen", bold: true, size: 52, color: FARBE.brk })],
  }),
  new Paragraph({
    spacing: { after: 400 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: FARBE.linie } },
    children: [
      new TextRun({
        text: "Vom Karton voller Einzelteile bis zum fertigen Sensor im Altkleidercontainer",
        size: 26,
        color: FARBE.leise,
      }),
    ],
  }),
  p("Diese Anleitung setzt keinerlei Vorkenntnisse voraus. Sie müssen noch nie gelötet haben, noch nie programmiert haben und nicht wissen, was ein Mikrocontroller ist. Alles, was Sie brauchen, steht hier drin – Schritt für Schritt, mit Bildbeschreibungen statt Fachjargon."),
  abstand(200),
  tabelle(
    ["", ""],
    [
      ["Zeitbedarf beim ersten Mal", "ein halber Tag, davon rund 2 Stunden reine Arbeit"],
      ["Ab dem zweiten Sensor", "etwa 1 Stunde"],
      ["Materialkosten je Sensor", "rund 110–145 €"],
      ["Werkzeug einmalig", "rund 100–180 €, falls nichts vorhanden ist"],
      ["Vorkenntnisse", "keine"],
    ],
    [3200, 5870],
  ),
  abstand(300),
  kasten(
    "Bitte einmal ganz lesen, bevor Sie etwas kaufen",
    [
      "Die Reihenfolge in dieser Anleitung ist mit Absicht so gewählt. Wer mittendrin einsteigt, lötet unter Umständen etwas fest, das später wieder ab muss.",
      "Besonders wichtig: Das Gerät wird im System angelegt, BEVOR die Software aufgespielt wird (Kapitel 5). Erst dabei entstehen die beiden Angaben, die in die Software gehören.",
    ],
    "hinweis",
  ),
  abstand(200),
  kasten(
    "Ehrlicher Hinweis zum Stand",
    [
      "Software und Schaltung sind vollständig ausgearbeitet, aber noch nie auf echter Hardware erprobt – dieser Sensor wird der erste sein. Rechnen Sie damit, dass an ein bis zwei Stellen nachgebessert werden muss.",
      "Kapitel 10 sagt Ihnen, woran Sie erkennen, wo es klemmt. Wenn etwas nicht klappt, liegt es sehr wahrscheinlich nicht an Ihnen.",
    ],
    "achtung",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// Überblick
// ======================================================================
füge(
  h1("Was Sie überhaupt bauen"),
  p("Ein Altkleidercontainer sagt Ihnen künftig selbst, wie voll er ist. Dazu bekommt er einen kleinen Kasten unter den Deckel. Darin steckt:"),
  punkte([
    "ein Ultraschallsensor – misst wie eine Fledermaus per Echo den Abstand nach unten zum Kleiderberg",
    "ein kleiner Computer, etwa so groß wie eine Streichholzschachtel – rechnet aus dem Abstand den Füllstand",
    "ein Mobilfunkteil mit SIM-Karte – schickt das Ergebnis viermal am Tag ins Internet",
    "eine Batterie – hält je nach Bauart ein Jahr oder mehrere Jahre",
  ]),
  p("Der Kasten schläft die meiste Zeit und wacht nur kurz auf, um zu messen und zu senden. Deshalb hält die Batterie so lange."),
  abstand(80),
  h3("Der Weg von hier bis dahin"),
  tabelle(
    ["Kapitel", "Was Sie tun", "Dauer"],
    [
      ["1", "Teile und Werkzeug einkaufen", "20 Min. bestellen,\ndann 1–3 Wochen warten"],
      ["2–3", "Arbeitsplatz einrichten, Löten üben", "45 Min."],
      ["4", "Die Teile miteinander verbinden (löten)", "45 Min."],
      ["5", "Das Gerät im System anmelden", "10 Min."],
      ["6", "Die Software auf den kleinen Computer spielen", "45 Min. beim ersten Mal"],
      ["7", "Auf dem Schreibtisch testen", "20 Min."],
      ["8", "In den Container einbauen", "30 Min. vor Ort"],
      ["9", "Sensor und Container einander zuordnen", "10 Min. vor Ort"],
    ],
    [900, 5970, 2200],
  ),
  abstand(160),
  kasten(
    "Zwei Fachbegriffe, die immer wieder vorkommen",
    [
      "„Löten“ heißt: zwei Metallteile mit flüssigem Metall dauerhaft verbinden. Wie Kleben, nur mit Zinn statt Klebstoff und mit einem heißen Werkzeug. Kapitel 3 bringt es Ihnen bei.",
      "„Flashen“ heißt: die Software auf den kleinen Computer übertragen. Passiert per USB-Kabel vom Windows-PC oder Mac aus – Sie klicken einen Knopf, der Rest läuft von allein.",
    ],
    "tipp",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 0. Sicherheit
// ======================================================================
füge(
  h1("0  Sicherheit – die vier Regeln"),
  p("Nichts an diesem Aufbau ist gefährlich, solange Sie diese vier Punkte beachten. Bitte einmal lesen, sie kosten eine Minute."),
  abstand(60),
  tabelle(
    ["", "Regel", "Warum"],
    [
      ["1", "Der Lötkolben wird über 300 °C heiß.\nImmer in den Ständer legen, nie ablegen.", "Er sieht kalt aus, ist es aber minutenlang nicht.\nVerbrennungen passieren fast immer beim Ablegen."],
      ["2", "Beim Löten den Kopf zur Seite,\nFenster auf.", "Der Rauch ist Flussmittel und reizt die Atemwege."],
      ["3", "Batterie NIE anschließen,\nsolange das USB-Kabel steckt.", "Bei den Lithium-Batterien aus Variante B kann das\ndie Zelle beschädigen – im schlimmsten Fall brennt sie."],
      ["4", "Batterien nicht öffnen, nicht kurzschließen,\nnicht in den Hausmüll.", "Lithium-Zellen gehören zum Sondermüll."],
    ],
    [500, 4100, 4470],
  ),
  abstand(160),
  kasten(
    "Sonderfall Langzeitbatterie (Variante B)",
    [
      "Falls Sie sich für die Lithium-Thionylchlorid-Zellen entscheiden (mehrere Jahre Laufzeit): Diese Zellen sind NICHT aufladbar, die Platine hat aber eine Ladeschaltung.",
      "Deshalb gehört dort zwingend eine Schottky-Diode in die Plusleitung, und das Batteriepaket wird vor jedem Anstecken des USB-Kabels abgeklemmt. Einzelheiten stehen in der Datei docs/hardware.md im Projekt.",
      "Für den ersten Sensor empfehlen wir ausdrücklich Variante A mit einer gewöhnlichen 18650-Zelle. Die ist unkompliziert und verzeiht Fehler.",
    ],
    "achtung",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 1. Einkaufen
// ======================================================================
füge(
  h1("1  Einkaufen"),
  p("Bestellen Sie alles auf einmal. Die Platine und der Sensor kommen meist aus China und brauchen ein bis drei Wochen; das Werkzeug ist in Deutschland in zwei Tagen da."),
  abstand(60),
  h2("1.1  Die Bauteile – für einen Sensor"),
  tabelle(
    ["Was", "Woran Sie es erkennen", "Wo", "ca."],
    [
      ["LilyGO T-SIM7080G-S3", "Grüne Platine, etwa 7 × 3 cm, mit\nSchacht für eine dicke Batterie", "lilygo.cc,\nAliExpress,\nAmazon", "45–60 €"],
      ["Ultraschallsensor\nA02YYUW (SEN0311)", "Schwarzer Zylinder, etwa so groß\nwie ein 2-Euro-Stück, mit Kabel und\nvierpoligem Stecker", "dfrobot.com,\nbotland.store", "17–25 €"],
      ["IoT-SIM-Karte von 1NCE", "Normale SIM-Karte, herausbrechbar\nauf Nano-Größe", "1nce.com", "12 €\nfür 10 Jahre"],
      ["LTE-Klebeantenne\nmit u.FL-Stecker", "Flacher Aufkleber mit dünnem Kabel\nund winzigem Druckknopf am Ende", "Reichelt,\nBerrybase", "8–14 €"],
      ["18650-Zelle, geschützt,\n3400 mAh", "Wie eine dicke AA-Batterie.\n„Geschützt“ / „protected“ muss\ndraufstehen", "Akkuplus,\nReichelt", "8–12 €"],
      ["Gehäuse IP67,\nca. 115 × 90 × 55 mm", "Grauer Kunststoffkasten mit Dichtung\nund verschraubtem Deckel", "Reichelt,\nBaumarkt", "9–15 €"],
      ["2 × Kabelverschraubung M12", "Kleine Kunststoffmuttern mit Gummi\nzum Abdichten von Kabeldurchführungen", "Reichelt,\nBaumarkt", "2 €"],
      ["MOSFET IRLZ44N", "Schwarzes Bauteil mit drei Beinchen\nund Metalllasche, etwa 1 cm breit", "Reichelt", "< 1 €"],
      ["Widerstände:\n1 × 100 Ω, 2 × 10 kΩ, 1 × 1 kΩ", "Kleine beige Zylinder mit Farbringen\nund zwei Drähten", "Reichelt\n(Sortiment)", "< 2 €"],
      ["LED 3 mm grün, diffus", "Kleines grünes Lämpchen mit\nzwei Beinchen, eines länger", "Reichelt", "< 1 €"],
      ["Reed-Kontakt\n+ Neodym-Magnet 10 mm", "Kleines Glasröhrchen mit zwei Drähten;\ndazu ein sehr starker kleiner Magnet", "Reichelt,\nBerrybase", "3–5 €"],
      ["Litze 0,25 mm², bunt", "Dünnes, biegsames Kabel auf einer Rolle", "Reichelt", "3 €"],
      ["Schrumpfschlauch-Sortiment", "Bunte Kunststoffröhrchen, die beim\nErhitzen eng werden", "Baumarkt", "5 €"],
      ["Butyl-Dichtband 10 mm", "Klebriges schwarzes Band auf einer Rolle", "Baumarkt", "5 €"],
    ],
    [2450, 3600, 1620, 1400],
  ),
  abstand(140),
  kasten(
    "Bestellen Sie zwei Sätze",
    [
      "Das kostet einmal Material, spart aber im Zweifel drei Wochen Wartezeit. Beim ersten Aufbau geht erfahrungsgemäß eine Kleinigkeit kaputt – ein zu heiß gewordenes Bauteil, ein abgerissenes Kabel.",
      "Und Sie haben sofort ein Ersatzgerät, wenn draußen einmal eines ausfällt.",
    ],
    "tipp",
  ),
  abstand(140),
  h2("1.2  Das Werkzeug – einmalig"),
  tabelle(
    ["Was", "Wozu", "ca."],
    [
      ["Lötstation, regelbar,\nz. B. Ersa oder Weller ab 40 €", "Zum Verbinden der Kabel. Wichtig ist die Regelung –\nein billiger Kolben ohne Regelung wird zu heiß und\nzerstört Bauteile.", "40–80 €"],
      ["Lötzinn 0,7 mm mit Flussmittelseele", "Das „Klebemittel“. Bleifrei oder bleihaltig ist beides\nin Ordnung; bleihaltig lässt sich leichter verarbeiten.", "8 €"],
      ["Dritte Hand oder kleiner Schraubstock", "Hält die Teile fest, während Sie löten.\nMit zwei Händen allein geht es nicht.", "10–15 €"],
      ["Seitenschneider und Abisolierzange", "Kabel kürzen und die Isolierung abziehen.", "15 €"],
      ["Multimeter", "Misst, ob eine Verbindung wirklich da ist.\nDas billigste für 20 € reicht völlig.", "20–30 €"],
      ["Heißluftföhn oder Feuerzeug", "Zum Schrumpfen der Schutzschläuche.", "0–25 €"],
      ["USB-C-Kabel", "Muss ein DATENKABEL sein, kein reines Ladekabel.\nDazu später mehr – das ist eine häufige Stolperfalle.", "5 €"],
      ["Stufenbohrer bis 20 mm", "Für die Löcher im Gehäuse.", "12–20 €"],
      ["Zollstock oder Lasermessgerät", "Um die Innenhöhe des Containers zu messen.", "–"],
    ],
    [2900, 4770, 1400],
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 2. Arbeitsplatz
// ======================================================================
füge(
  h1("2  Arbeitsplatz einrichten"),
  p("Fünfzehn Minuten, die sich lohnen. Ein guter Arbeitsplatz verhindert die meisten Fehler."),
  abstand(60),
  ...punkte([
    "Tisch freiräumen. Sie brauchen etwa einen halben Quadratmeter.",
    "Eine alte Holzplatte, ein Backblech oder eine Fliese unterlegen – der Lötkolben hinterlässt sonst Brandflecken.",
    "Fenster öffnen oder kippen.",
    "Gute Beleuchtung. Eine Schreibtischlampe direkt über den Arbeitsbereich. Die Teile sind klein.",
    "Alle Teile auspacken und nebeneinanderlegen. Die kleinen Widerstände in eine flache Schale, sonst rollen sie weg.",
    "Diese Anleitung ausgedruckt oder auf einem zweiten Bildschirm daneben.",
  ]),
  abstand(120),
  kasten(
    "Die Widerstände auseinanderhalten",
    [
      "Alle Widerstände sehen gleich aus, die Farbringe verraten den Wert. Sie brauchen drei verschiedene:",
      "100 Ω – braun, schwarz, braun.     10 kΩ – braun, schwarz, orange.     1 kΩ – braun, schwarz, rot.",
      "Wenn Sie unsicher sind: das Multimeter auf Widerstandsmessung (Ω) stellen und nachmessen. Das ist zuverlässiger als Farben zu deuten, gerade bei schlechtem Licht.",
    ],
    "tipp",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 3. Löten
// ======================================================================
füge(
  h1("3  Löten lernen – in zwanzig Minuten"),
  p("Überspringen Sie dieses Kapitel nicht, wenn Sie noch nie gelötet haben. Zwanzig Minuten Üben ersparen Ihnen später eine Stunde Fehlersuche."),
  abstand(60),
  h2("3.1  Was dabei eigentlich passiert"),
  p("Lötzinn ist ein Metall, das schon bei etwa 220 °C flüssig wird. Sie erhitzen die beiden Teile, die verbunden werden sollen, halten das Zinn daran – es schmilzt, fließt in jede Ritze und wird beim Abkühlen fest. Fertig ist eine Verbindung, die hält und Strom leitet."),
  pm([
    { text: "Der häufigste Anfängerfehler: ", fett: true },
    "das Zinn am Lötkolben schmelzen und dann auf die Teile tropfen lassen. Das ergibt eine „kalte Lötstelle“ – sie sieht aus wie eine Verbindung, ist aber keine. Immer die ",
    { text: "Teile", fett: true },
    " erhitzen, nie das Zinn.",
  ]),
  abstand(60),
  h2("3.2  So geht es richtig"),
  ...[
    ["Lötkolben auf 320 °C stellen und zwei Minuten aufheizen.", "Bei bleifreiem Zinn eher 350 °C."],
    ["Die Spitze verzinnen: ein wenig Zinn auf die heiße Spitze geben, bis sie silbrig glänzt.", "Eine blanke oder schwarze Spitze überträgt kaum Wärme."],
    ["Beide Teile in die dritte Hand einspannen, sodass sie sich berühren.", "Wackeln sie, wird die Lötstelle schlecht."],
    ["Die Lötspitze an BEIDE Teile gleichzeitig halten. Zwei Sekunden warten.", "Die Teile müssen heiß werden, nicht nur berührt."],
    ["Jetzt das Zinn an die Stelle führen, wo Spitze und Teile sich treffen. Es fließt von allein hinein.", "Es zieht sich in die Verbindung, wie Wasser in einen Schwamm."],
    ["Zinn wegnehmen, danach den Kolben wegnehmen. Nicht bewegen, bis es matt geworden ist – etwa zwei Sekunden.", "Bewegung beim Erstarren ergibt eine brüchige Stelle."],
  ].map(([schritt, warum], i) =>
    new Paragraph({
      numbering: { reference: "schritte", level: 0 },
      spacing: { after: 100, line: 276 },
      children: [
        new TextRun({ text: schritt, size: 21, color: FARBE.text }),
        new TextRun({ text: "  " + warum, size: 19, italics: true, color: FARBE.leise }),
      ],
    }),
  ),
  abstand(100),
  h3("Woran Sie eine gute Lötstelle erkennen"),
  tabelle(
    ["Gut", "Schlecht"],
    [
      ["Glänzend bis leicht matt, glatt", "Stumpf, grau, krümelig"],
      ["Form wie ein kleiner Vulkan – läuft flach aus", "Form wie eine Kugel, die obendrauf sitzt"],
      ["Das Zinn ist sichtbar in die Teile gezogen", "Das Zinn liegt nur auf und berührt kaum"],
      ["Zug am Kabel: hält", "Zug am Kabel: löst sich"],
    ],
    [4535, 4535],
  ),
  abstand(140),
  kasten(
    "Erst üben, dann ernst machen",
    [
      "Nehmen Sie zwei Stücke der bunten Litze, ziehen Sie an beiden Enden 5 mm Isolierung ab und löten Sie sie aneinander. Machen Sie das fünfmal.",
      "Danach ziehen Sie kräftig an beiden Enden. Halten alle fünf? Dann können Sie löten. Löst sich eine, üben Sie weiter – erst dann geht es an die echten Teile.",
    ],
    "tipp",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 4. Verdrahtung
// ======================================================================
füge(
  h1("4  Die Teile verbinden"),
  p("Jetzt wird gelötet. Nehmen Sie sich eine Stunde Zeit und arbeiten Sie die Schritte der Reihe nach ab."),
  abstand(60),
  h2("4.1  Was wohin gehört – die Übersicht"),
  p("Auf der Platine sitzen am Rand kleine beschriftete Löcher, die Stiftleiste. Dort kommen Ihre Kabel hin. Die Beschriftung steht winzig daneben – Lupe oder Handykamera mit Zoom hilft."),
  abstand(60),
  tabelle(
    ["Von (Platine)", "Nach", "Dazwischen", "Wozu"],
    [
      ["3V3", "Sensor: VCC", "–", "Stromversorgung des Sensors"],
      ["GND", "MOSFET: Bein S", "–", "gemeinsame Masse"],
      ["GPIO 16", "MOSFET: Bein G", "100 Ω in Reihe,\nzusätzlich 10 kΩ von G nach GND", "schaltet den Sensor ein und aus"],
      ["MOSFET: Bein D", "Sensor: GND", "–", "der geschaltete Rückweg des Stroms"],
      ["GPIO 18", "Sensor: Datenleitung\n(Messwerte kommen von hier)", "10 kΩ in Reihe", "die Messwerte"],
      ["GPIO 17", "Sensor: zweite Signalleitung", "–", "wird nicht benutzt,\nkann auch offen bleiben"],
      ["GPIO 21", "LED: langes Bein", "1 kΩ in Reihe", "Statusanzeige"],
      ["GND", "LED: kurzes Bein", "–", "Rückweg der LED"],
      ["GPIO 15", "Reed-Kontakt: ein Draht", "–", "Taster zum Anlernen"],
      ["GND", "Reed-Kontakt: anderer Draht", "–", "Rückweg des Kontakts"],
    ],
    [1750, 2900, 2620, 1800],
  ),
  abstand(140),
  kasten(
    "Die Modem-Anschlüsse gehen Sie nichts an",
    [
      "In der Software stehen noch vier weitere Anschlüsse (GPIO 4, 5, 41, 42). Die verbinden den kleinen Computer mit dem Mobilfunkteil und sind auf der Platine schon fest verdrahtet. Sie müssen dort nichts tun.",
    ],
    "hinweis",
  ),
  abstand(140),
  h3("Dasselbe als Zeichnung"),
  ...code([
    "  Platine T-SIM7080G-S3                       Ultraschallsensor",
    "  ---------------------                       ----------------",
    "",
    "     3V3  o------------------------------------o  VCC",
    "",
    "  GPIO16  o---[100 Ohm]---+--- G |",
    "                          |      |  IRLZ44N",
    "                       [10 kOhm] |  (MOSFET)",
    "                          |      |",
    "     GND  o---------------+--- S |",
    "                            D |  o------------o  GND",
    "",
    "  GPIO18  o---[10 kOhm]-------------------------o  Datenleitung",
    "  GPIO17  o------------------------------------o  zweite Signalleitung",
    "",
    "  GPIO21  o---[1 kOhm]---|>|--- GND     (LED, langes Bein am Widerstand)",
    "",
    "  GPIO15  o---[ Reed-Kontakt ]--- GND",
  ]),
  abstand(100),
  h2("4.2  Der MOSFET – welches Bein ist welches"),
  p("Der IRLZ44N ist das schwarze Bauteil mit der Metalllasche und drei Beinen. Halten Sie ihn so, dass Sie die beschriftete schwarze Vorderseite sehen und die Beine nach unten zeigen. Dann gilt von links nach rechts:"),
  abstand(40),
  tabelle(
    ["Bein", "Name", "Kommt an"],
    [
      ["links", "G (Gate)", "GPIO 16, über den 100-Ω-Widerstand"],
      ["Mitte", "D (Drain)", "GND-Leitung des Ultraschallsensors"],
      ["rechts", "S (Source)", "GND der Platine"],
    ],
    [1600, 2400, 5070],
  ),
  abstand(120),
  p("Der MOSFET ist ein elektronischer Schalter ohne bewegliche Teile. Liegt am Gate Spannung an, fließt Strom von D nach S – der Sensor bekommt Masse und läuft. Ohne Spannung am Gate ist der Sensor stromlos. Genau das braucht die Batterie: der Sensor allein würde sie in wenigen Tagen leeren, geschaltet läuft er nur wenige Sekunden am Tag."),
  pm([
    "Der 10-kΩ-Widerstand zwischen Gate und GND ist wichtig: Er sorgt dafür, dass der Sensor sicher ",
    { text: "aus", fett: true },
    " ist, solange der kleine Computer noch startet und den Anschluss nicht bewusst ansteuert.",
  ]),
  abstand(80),
  h2("4.3  Schritt für Schritt"),
  ...[
    "Schneiden Sie sich sechs Stücke Litze zurecht, je etwa 12 cm. Nehmen Sie unterschiedliche Farben und notieren Sie sich, welche Farbe wohin geht – rot für 3V3 und schwarz für GND ist üblich.",
    "Ziehen Sie an allen Enden 4 mm Isolierung ab und verzinnen Sie die blanken Enden: Litze erhitzen, etwas Zinn dran, bis sie silbrig glänzt. Danach fransen sie nicht mehr aus.",
    "Löten Sie zuerst die Widerstände an. Ein Bein des 100-Ω-Widerstands an ein Kabelende, das andere Bein an das Gate des MOSFET. Genauso den 10-kΩ-Widerstand in die Datenleitung und den 1-kΩ-Widerstand an das lange Bein der LED. Schieben Sie vor dem Löten je ein Stück Schrumpfschlauch über das Kabel.",
    "Löten Sie den zweiten 10-kΩ-Widerstand zwischen das Gate und das Source-Bein des MOSFET. Der sitzt direkt am Bauteil, ohne Kabel dazwischen.",
    "Jetzt die Verbindungen zur Platine, eine nach der anderen. Nach jeder Verbindung: Schrumpfschlauch drüberschieben und mit dem Föhn oder kurz mit dem Feuerzeug schrumpfen. Nichts darf blank bleiben.",
    "Die vier Adern des Ultraschallsensors nach Tabelle anschließen. Der Sensor hat einen Stecker; entweder Sie schneiden ihn ab und löten direkt, oder Sie besorgen die passende Buchse.",
    "Reed-Kontakt und LED zuletzt. Beide werden später ins Gehäuse geklebt – lassen Sie die Kabel großzügig lang.",
    "Alles noch einmal gegen die Tabelle prüfen. Zeile für Zeile mit dem Finger nachgehen und abhaken.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte2", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(120),
  kasten(
    "Die Aderfarben des Ultraschallsensors",
    [
      "Der A02YYUW hat vier Adern: Stromversorgung, Masse und zwei Signalleitungen. Der Farbcode wechselt je nach Lieferung – verlassen Sie sich nicht auf Rot und Schwarz allein, sondern schauen Sie in das Datenblatt, das dem Sensor beiliegt (oder auf wiki.dfrobot.com/sen0311).",
      "Falls Sie die beiden Signalleitungen verwechseln, geht nichts kaputt – es kommen dann nur keine Messwerte. In dem Fall die beiden Adern tauschen und erneut testen.",
    ],
    "achtung",
  ),
  abstand(140),
  h2("4.4  Kontrolle mit dem Multimeter"),
  p("Bevor Sie zum ersten Mal Strom draufgeben, prüfen Sie zwei Dinge. Das dauert fünf Minuten und erspart Ihnen im schlimmsten Fall eine zerstörte Platine."),
  abstand(40),
  ...punkte([
    "Multimeter auf Durchgangsprüfung stellen (Symbol mit dem Ton oder der Diode). Halten die beiden Spitzen aneinander, muss es piepsen.",
    "Prüfen Sie jede Verbindung aus der Tabelle: eine Spitze an das eine Ende, eine an das andere. Es muss piepsen. Bei den Verbindungen mit Widerstand piepst es nicht – dort auf Widerstandsmessung umstellen und den erwarteten Wert ablesen.",
    "Jetzt der wichtigste Test: eine Spitze an 3V3, eine an GND. Es darf NICHT piepsen. Piepst es, haben Sie irgendwo einen Kurzschluss – suchen Sie ihn, bevor Sie die Batterie einlegen.",
  ]),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 5. Gerät anmelden
// ======================================================================
füge(
  h1("5  Das Gerät im System anmelden"),
  pm([
    { text: "Dieser Schritt kommt vor dem Aufspielen der Software. ", fett: true },
    "Dabei entstehen zwei Angaben, die gleich in die Software gehören. Wer erst flasht und dann anmeldet, macht die Arbeit zweimal.",
  ]),
  abstand(60),
  ...[
    "Melden Sie sich an: " + ADRESSE + "/login – mit dem Zugang, den Sie von der Administration bekommen haben. Sie brauchen dafür die Rolle Disposition oder Administration.",
    "Gehen Sie auf „Sensoren“ und dort auf „Gerät aufnehmen“.",
    "Vergeben Sie eine Geräte-ID. Nehmen Sie eine einfache, fortlaufende: ALT-0001, ALT-0002 und so weiter. Diese Nummer schreiben Sie später außen auf das Gehäuse.",
    "IMEI und ICCID können Sie leer lassen; die trägt das Gerät später selbst nach. Die restlichen Felder auf den Voreinstellungen belassen – Sendeintervall 360 Minuten bedeutet vier Meldungen am Tag.",
    "Auf „Gerät anlegen“ klicken.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte3", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(60),
  p("Danach zeigt Ihnen die Seite drei Dinge an:"),
  abstand(40),
  tabelle(
    ["Angabe", "Wofür", "Was Sie damit tun"],
    [
      ["Geräte-ID\nz. B. ALT-0001", "Der Name des Geräts", "Kommt gleich in die Software\nund außen aufs Gehäuse"],
      ["Geräteschlüssel\n64 Zeichen", "Damit unterschreibt das Gerät seine\nMesswerte, sodass niemand fremde\nWerte einspielen kann", "Kommt gleich in die Software.\nWird NUR EINMAL angezeigt"],
      ["Anlerncode\nz. B. 7K4P-2QX9", "Damit wird der Sensor später vor Ort\nseinem Container zugeordnet", "Auf das Etikett, das aufs\nGehäuse geklebt wird"],
    ],
    [2200, 4270, 2600],
  ),
  abstand(140),
  kasten(
    "Der Geräteschlüssel erscheint nur ein einziges Mal",
    [
      "Verlassen Sie die Seite nicht, bevor Sie ihn gesichert haben. Am einfachsten: den Knopf „kopieren“ drücken und den Text sofort in eine Textdatei auf Ihrem Rechner einfügen – Sie brauchen ihn in wenigen Minuten in Kapitel 6.",
      "Falls er doch verloren geht: kein Drama, aber Sie müssen das Gerät löschen und neu anlegen.",
    ],
    "achtung",
  ),
  abstand(140),
  h2("5.1  Etikett drucken"),
  p("Klicken Sie in der Sensorliste bei Ihrem Gerät auf „Etikett“. Es erscheint eine Druckvorlage mit Geräte-ID, Anlerncode und einem QR-Code. Drucken (Strg + P), ausschneiden, am besten laminieren und außen auf das Gehäuse kleben."),
  p("Der QR-Code führt später direkt in den Anlernvorgang – Handykamera drauf, und die richtige Seite geht auf. Ohne Etikett müssen Sie den Code draußen von Hand eintippen."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 6. Software
// ======================================================================
füge(
  h1("6  Die Software aufspielen"),
  p("Der kleine Computer ist ab Werk leer. Jetzt bekommt er sein Programm. Beim ersten Mal dauert das etwa 45 Minuten, weil einige Werkzeuge installiert werden müssen; beim zweiten Gerät sind es fünf Minuten."),
  abstand(60),
  h2("6.1  Wo der Code liegt"),
  p("Das gesamte Projekt liegt öffentlich auf GitHub:"),
  ...code([REPO]),
  p("Der Teil für den Sensor steckt im Ordner firmware/altkleider-sensor. Sie müssen dort nichts programmieren – der Code ist fertig, Sie tragen nur zwei Angaben ein und drücken auf Hochladen."),
  abstand(60),
  h2("6.2  Zwei Programme installieren"),
  ...[
    "Visual Studio Code herunterladen und installieren: code.visualstudio.com. Das ist ein Texteditor für Programmierer, kostenlos, von Microsoft. Bei der Installation alles auf den Voreinstellungen lassen.",
    "Visual Studio Code starten. Links in der Leiste auf das Symbol mit den vier Quadraten klicken (Erweiterungen). Oben ins Suchfeld „PlatformIO IDE“ eintippen und auf „Install“ klicken.",
    "Warten. Die Installation lädt einige hundert Megabyte und dauert je nach Leitung fünf bis fünfzehn Minuten. Wenn ein Neustart angeboten wird, annehmen.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte4", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(80),
  h2("6.3  Das Projekt herunterladen"),
  p("Der einfachste Weg ohne weitere Werkzeuge:"),
  ...[
    "Im Browser " + REPO + " öffnen.",
    "Auf den grünen Knopf „Code“ klicken, dann auf „Download ZIP“.",
    "Die heruntergeladene Datei entpacken, zum Beispiel nach Dokumente. Sie erhalten einen Ordner F-llstand-Altkleider-… mit vielen Unterordnern.",
    "In Visual Studio Code: Datei → Ordner öffnen. Wählen Sie den Unterordner firmware/altkleider-sensor aus – NICHT den obersten Ordner. Sonst findet PlatformIO das Projekt nicht.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte5", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(80),
  h2("6.4  Die beiden Angaben eintragen"),
  p("Im geöffneten Projekt sehen Sie links eine Dateiliste. Öffnen Sie den Ordner include. Dort liegt eine Datei geheimnisse.beispiel.h."),
  ...[
    "Rechtsklick auf geheimnisse.beispiel.h → Kopieren, dann Rechtsklick in den Ordner → Einfügen. Benennen Sie die Kopie um in geheimnisse.h (ohne „beispiel“).",
    "Öffnen Sie geheimnisse.h mit einem Doppelklick.",
    "Tragen Sie zwischen die Anführungszeichen ein, was Sie in Kapitel 5 bekommen haben.",
    "Speichern mit Strg + S.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte6", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(40),
  ...code([
    "#define GERAETE_ID   \"ALT-0001\"",
    "#define GERAETE_KEY  \"hier die 64 Zeichen einfuegen\"",
    "#define GERAETE_PROVISIONIERUNG \"\"",
  ]),
  p("Die dritte Zeile bleibt leer. Sie wird nur gebraucht, wenn später viele Geräte mit derselben Software bestückt werden sollen."),
  abstand(100),
  kasten(
    "Diese Datei bleibt auf Ihrem Rechner",
    [
      "geheimnisse.h enthält den Schlüssel Ihres Geräts und darf nicht ins Internet. Das Projekt ist so eingerichtet, dass die Datei beim Hochladen nach GitHub automatisch übersprungen wird – Sie müssen nichts weiter beachten, außer sie nicht selbst irgendwo hochzuladen.",
    ],
    "hinweis",
  ),
  abstand(140),
  h2("6.5  Adresse und SIM-Karte prüfen"),
  p("Öffnen Sie im selben Ordner die Datei konfiguration.h. Zwei Zeilen sollten Sie kurz ansehen:"),
  ...code([
    "#define SERVER_HOST      \"" + ADRESSE + "\"",
    "#define APN              \"iot.1nce.net\"",
  ]),
  p("Die erste ist die Adresse, an die der Sensor seine Messwerte schickt. Die zweite gehört zur SIM-Karte – bei 1NCE stimmt sie so; bei einem anderen Anbieter tragen Sie dessen Angabe ein. Stimmt beides, ändern Sie nichts."),
  abstand(80),
  h2("6.6  Hochladen"),
  ...[
    "Legen Sie die SIM-Karte in die Platine ein. Der Schacht sitzt an der Kante; die abgeschrägte Ecke der Karte zeigt in die Richtung, die das Symbol daneben vorgibt.",
    "Stecken Sie die Antenne an. Der winzige Druckknopf am Kabelende wird senkrecht auf den passenden Anschluss der Platine gedrückt, bis es leise klickt. Das braucht etwas Gefühl – nicht schräg drücken.",
    "Verbinden Sie die Platine per USB-C-Kabel mit dem Rechner. Die Batterie bleibt dabei DRAUSSEN.",
    "In Visual Studio Code unten in der blauen Leiste auf den Pfeil nach rechts klicken (→). Das ist „Upload“. Wenn Sie mit der Maus darüberfahren, erscheint der Hinweis.",
    "Jetzt passiert einige Minuten lang viel im unteren Fenster: Beim ersten Mal lädt PlatformIO die passenden Werkzeuge für diesen Chip herunter. Das ist normal.",
    "Am Ende muss dort in grün SUCCESS stehen. Erscheint stattdessen ein roter Fehler, schauen Sie in Kapitel 10.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte7", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(120),
  kasten(
    "Die häufigste Stolperfalle: das USB-Kabel",
    [
      "Viele USB-C-Kabel, die Ladegeräten beiliegen, können nur laden und keine Daten übertragen. Damit passiert beim Hochladen nichts – der Rechner erkennt die Platine gar nicht.",
      "Wenn PlatformIO meldet, es finde keinen Anschluss: zuerst ein anderes Kabel probieren. Das löst diesen Fehler in neun von zehn Fällen.",
      "Hilft das nicht, halten Sie beim Einstecken die Taste BOOT auf der Platine gedrückt, lassen sie nach zwei Sekunden los und starten den Upload erneut.",
    ],
    "achtung",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 7. Test
// ======================================================================
füge(
  h1("7  Test auf dem Schreibtisch"),
  p("Bevor der Sensor an einen Container kommt, muss er hier auf dem Tisch funktionieren. Diesen Schritt bitte nicht überspringen – draußen am Container Fehler zu suchen, kostet ein Vielfaches an Zeit."),
  abstand(60),
  h2("7.1  Mitlesen, was das Gerät tut"),
  p("In Visual Studio Code unten in der blauen Leiste auf das Steckersymbol klicken („Serial Monitor“). Es öffnet sich ein Fenster, in dem das Gerät erzählt, was es gerade macht. Drücken Sie danach die kleine Taste RST auf der Platine – das Gerät startet neu."),
  p("Sie sollten in etwa Folgendes sehen:"),
  ...code([
    "== ALT-0001 / Firmware 1.0.0 / Start 1 / Anlass neustart ==",
    "Abstand: 812 mm",
    "Modem wird gestartet ...",
    "Warte auf Netz ...",
    "Baue Datenverbindung auf ...",
    "HTTP 200: {\"ok\":true,\"intervall_minuten\":360,...}",
    "Schlafe 360 Minuten.",
  ]),
  abstand(60),
  h2("7.2  Was jede Zeile bedeutet"),
  tabelle(
    ["Zeile", "Bedeutung", "Wenn sie fehlt oder anders lautet"],
    [
      ["Abstand: … mm", "Der Ultraschallsensor misst. Halten Sie die Hand\n30 cm darunter – der Wert muss sich ändern.", "Steht dort -1: Verkabelung des Sensors prüfen,\ngegebenenfalls die beiden Signaladern tauschen."],
      ["Warte auf Netz …", "Das Mobilfunkteil sucht ein Netz. Das dauert\nbeim ersten Mal bis zu zwei Minuten.", "„Kein Netz“: SIM richtig eingelegt?\nAntenne angesteckt? Im Keller testen\nfunktioniert oft nicht."],
      ["HTTP 200", "Der Messwert ist angekommen. Das ist der Beweis,\ndass alles zusammenspielt.", "HTTP 401: Geräteschlüssel stimmt nicht.\nHTTP 404: Geräte-ID unbekannt.\nBeides in geheimnisse.h prüfen."],
      ["Schlafe 360 Minuten", "Das Gerät legt sich schlafen. Ab jetzt meldet es\nsich viermal am Tag von allein.", "–"],
    ],
    [1900, 3900, 3270],
  ),
  abstand(140),
  h2("7.3  Die Gegenprobe im System"),
  p("Öffnen Sie " + ADRESSE + "/intern/sensoren. Ihr Gerät muss dort jetzt eine Meldung zeigen – „vor wenigen Minuten“ – und eine Batteriespannung. Damit ist die ganze Kette bewiesen: Sensor, Mobilfunk, Datenbank."),
  abstand(60),
  h2("7.4  Den Taster prüfen"),
  p("Halten Sie den Magneten an das Reed-Röhrchen. Die grüne LED muss zweimal kurz blinken, das Gerät wacht auf und sendet sofort. Nach erfolgreicher Übertragung blinkt sie dreimal schnell."),
  abstand(40),
  tabelle(
    ["LED-Signal", "Bedeutung"],
    [
      ["2 × kurz", "Magnet erkannt, Messung läuft"],
      ["3 × kurz und schnell", "Messwert erfolgreich übertragen"],
      ["1 × lang", "Kein Netz – der Messwert wurde zwischengespeichert\nund wird beim nächsten Mal nachgereicht"],
    ],
    [2600, 6470],
  ),
  abstand(120),
  h2("7.5  Messgenauigkeit prüfen"),
  p("Legen Sie den Sensor auf den Tisch, mit der Messfläche nach oben, und halten Sie ein Buch oder Brett in verschiedenen Abständen darüber. Prüfen Sie mit dem Zollstock nach. Bei 30 cm, 1 m und 2 m sollte die Anzeige auf wenige Zentimeter genau stimmen."),
  p("Weicht sie stark ab, richten Sie den Sensor genauer senkrecht aus – schräg gehaltene Flächen werfen das Echo zur Seite."),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 8. Einbau
// ======================================================================
füge(
  h1("8  Einbau in den Container"),
  h2("8.1  Zuerst alles ins Gehäuse"),
  ...[
    "Bohren Sie zwei Löcher in eine Schmalseite des Gehäuses, passend zu den Kabelverschraubungen (meist 16 mm für M12). Nehmen Sie den Stufenbohrer und bohren Sie langsam – Kunststoff reißt bei zu viel Druck.",
    "Ein Loch für das Sensorkabel, eines für das Antennenkabel. Verschraubungen einsetzen und festziehen.",
    "Platine ins Gehäuse legen, mit doppelseitigem Klebeband oder kleinen Schrauben fixieren, sodass sie nicht wandert.",
    "LED so anordnen, dass sie durch den Deckel zu sehen ist – bei durchsichtigem Deckel reicht es, sie darunter zu kleben. Bei undurchsichtigem Deckel bohren Sie ein 3-mm-Loch und dichten die LED mit einem Tropfen Heißkleber ab.",
    "Reed-Kontakt innen an eine Seitenwand kleben und die Stelle außen markieren – dort müssen Sie später den Magneten anhalten.",
    "Batterie einlegen. Achten Sie auf Plus und Minus, die Markierung steht im Halter.",
    "Deckel aufsetzen, alle Schrauben gleichmäßig anziehen.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte8", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(140),
  kasten(
    "Der wichtigste Punkt der ganzen Anleitung: die Antenne",
    [
      "Ein Altkleidercontainer ist ein Kasten aus Stahlblech. Blech schirmt Funk ab – eine Antenne im Inneren bekommt so gut wie keine Verbindung zustande. Das ist der häufigste Grund, warum solche Aufbauten „manchmal“ funktionieren.",
      "Die Klebeantenne gehört deshalb NACH AUSSEN: unter eine Kunststoffabdeckung, ins Schriftfeld oder unter die Einwurfklappe – geschützt vor Regen und Vandalismus, aber ohne Blech dazwischen. Das Kabel führen Sie durch die abgedichtete Verschraubung.",
      "Prüfen Sie nach dem Einbau in der Sensorliste den Funkpegel. Unter etwa −105 dBm sollten Sie die Antenne umsetzen.",
    ],
    "achtung",
  ),
  abstand(140),
  h2("8.2  Am Container"),
  ...[
    "Messen Sie mit dem Zollstock die Innenhöhe: vom Deckel senkrecht bis zum Boden des leeren Containers. Schreiben Sie den Wert in Millimetern auf – Sie brauchen ihn gleich.",
    "Suchen Sie die Mitte des Deckels. Der Sensor muss senkrecht nach unten schauen und darf NICHT über der Einwurfklappe sitzen – sonst misst er die Klappe statt der Kleidung.",
    "Befestigen Sie den Sensor so, dass er 3 bis 5 cm unter dem Blech hängt, nicht bündig darauf. Ganz nah am Blech kann er nicht messen; die ersten drei Zentimeter sind sein blinder Fleck.",
    "Das Gehäuse daneben an den Deckel schrauben oder kleben.",
    "Alle Durchführungen mit Butyl-Dichtband abdichten. Die Kabel als Tropfschlaufe verlegen – also erst nach unten, dann wieder hoch zur Verschraubung. So läuft Wasser ab, statt hineinzulaufen.",
    "Deckel schließen und einmal kräftig rütteln. Nichts darf klappern oder sich lösen.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte9", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(120),
  kasten(
    "Die Messfläche freihalten",
    [
      "Wenn jemand einen Sack hochwirft und der auf dem Sensor liegen bleibt, misst er ab da nur noch diesen Sack. Ein kleines Gitter oder ein 2 cm überstehender Kragen um den Sensor verhindert das.",
    ],
    "tipp",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 9. Anlernen
// ======================================================================
füge(
  h1("9  Sensor und Container einander zuordnen"),
  p("Der Sensor hängt, ist aber noch ein Einzelgänger: Das System weiß nicht, an welchem Container er sitzt und was bei diesem Container „leer“ bedeutet. Das klären Sie jetzt – am besten gleich vor Ort, mit dem Handy, bei leerem Container."),
  abstand(60),
  ...[
    "Rufen Sie auf dem Handy " + ADRESSE + "/intern/sensoren/anlernen auf. Oder scannen Sie einfach den QR-Code auf dem Gehäuse – dann sind Sie sofort an der richtigen Stelle.",
    "Schritt 1, Gerät: Der Anlerncode steht schon da, wenn Sie den QR-Code gescannt haben. Sonst tippen Sie ihn vom Etikett ab.",
    "Schritt 2, Container: Tippen Sie auf „In der Nähe“ – dann steht der Container, vor dem Sie stehen, meist ganz oben. Antippen.",
    "Schritt 3, Koppeln: Die Zusammenfassung prüfen, dann auf „Jetzt koppeln“. Hängt an diesem Container schon ein anderer Sensor, müssen Sie „ersetzen“ bestätigen.",
    "Schritt 4, Kalibrieren: Jetzt lernt das System, welcher Abstand „leer“ heißt. Container muss leer und der Deckel zu sein.",
    "Halten Sie den Magneten an die markierte Stelle am Gehäuse. Die LED blinkt zweimal – das Gerät misst und sendet sofort.",
    "Warten Sie eine Minute, dann tippen Sie auf „Leerwert übernehmen“. Das System nimmt den Mittelwert der letzten Messungen.",
    "Geht der Container gerade nicht zu leeren, tragen Sie stattdessen die Innenhöhe aus Kapitel 8 von Hand ein.",
  ].map((text) =>
    new Paragraph({
      numbering: { reference: "schritte10", level: 0 },
      spacing: { after: 110, line: 276 },
      children: [new TextRun({ text, size: 21, color: FARBE.text })],
    }),
  ),
  abstand(120),
  p("Fertig. Der Container erscheint jetzt auf der Karte mit seinem Füllstand und meldet sich viermal am Tag von allein."),
  abstand(120),
  kasten(
    "Ohne Kalibrierung kein Prozentwert",
    [
      "Solange kein Leerwert hinterlegt ist, sammelt das System zwar Messwerte, kann daraus aber keinen Füllstand in Prozent errechnen. Der Container erscheint dann als „Keine Daten“.",
      "Das lässt sich jederzeit nachholen – auf der Containerseite unter „Kalibrierung“. Das System rechnet danach alle bereits gesammelten Messwerte neu durch, die Kurve stimmt also auch rückwirkend.",
    ],
    "hinweis",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// 10. Fehlersuche
// ======================================================================
füge(
  h1("10  Wenn etwas nicht klappt"),
  p("Arbeiten Sie die Tabelle von oben nach unten ab. Die häufigsten Ursachen stehen zuerst."),
  abstand(60),
  h2("10.1  Beim Aufspielen der Software"),
  tabelle(
    ["Was Sie sehen", "Woran es meistens liegt", "Was hilft"],
    [
      ["„Could not find\na serial port“", "Das USB-Kabel kann nur laden,\nnicht Daten übertragen", "Anderes Kabel nehmen. Das löst es\nin den meisten Fällen."],
      ["Upload bricht ab oder\nhängt bei „Connecting…“", "Der Chip ist nicht im\nAufnahmemodus", "Taste BOOT gedrückt halten, USB\neinstecken, nach 2 Sekunden loslassen,\nUpload erneut starten."],
      ["„geheimnisse.h:\nNo such file“", "Die Datei wurde nicht\nangelegt oder heißt falsch", "Muss genau geheimnisse.h heißen und\nim Ordner include liegen – nicht\ngeheimnisse.beispiel.h."],
      ["Lange Fehlerliste\nbeim ersten Versuch", "PlatformIO lädt noch die\nWerkzeuge herunter", "Einfach ein zweites Mal auf Upload\nklicken, wenn der Download fertig ist."],
    ],
    [2100, 3100, 3870],
  ),
  abstand(140),
  h2("10.2  Beim Test"),
  tabelle(
    ["Was Sie sehen", "Woran es meistens liegt", "Was hilft"],
    [
      ["Abstand: -1", "Der Ultraschallsensor\nantwortet nicht", "Verkabelung prüfen. Häufig sind die\nbeiden Signaladern vertauscht –\neinfach tauschen und erneut testen."],
      ["Abstand schwankt stark", "Der Sensor misst schräg\noder zu nah", "Senkrecht ausrichten, Mindestabstand\nvon 3 cm einhalten."],
      ["„Modem antwortet nicht“", "Die Platine bekommt zu\nwenig Strom", "Batterie einlegen statt nur USB.\nDas Mobilfunkteil braucht kurzzeitig\nviel Strom."],
      ["„Kein Netz“", "Keine Antenne, keine SIM\noder schlechter Empfang", "Antenne fest angesteckt? SIM richtig\nherum? Draußen oder am Fenster testen,\nnicht im Keller."],
      ["HTTP 401", "Der Geräteschlüssel\nstimmt nicht", "geheimnisse.h prüfen. Beim Kopieren\ngeht leicht ein Zeichen verloren –\nlieber neu einfügen."],
      ["HTTP 404", "Die Geräte-ID ist dem\nSystem unbekannt", "Schreibweise vergleichen. Groß- und\nKleinschreibung zählt."],
      ["HTTP 401 mit\n„Zeitstempel“", "Die Uhr des Geräts\nweicht zu stark ab", "Kommt vor, wenn kein Netz erreichbar\nwar. Nach erfolgreicher Verbindung\nlöst es sich von selbst."],
    ],
    [2100, 3100, 3870],
  ),
  abstand(140),
  h2("10.3  Im laufenden Betrieb"),
  tabelle(
    ["Was Sie sehen", "Woran es meistens liegt", "Was hilft"],
    [
      ["„Kein Signal“ nach\nein paar Tagen", "Antenne sitzt innen\nim Blechcontainer", "Antenne nach außen verlegen.\nSiehe Kapitel 8.1."],
      ["Füllstand steht auf\n„Keine Daten“", "Der Container ist noch\nnicht kalibriert", "Auf der Containerseite unter\n„Kalibrierung“ nachholen."],
      ["Füllstand springt\nunplausibel", "Ein Kleidersack liegt auf\ndem Sensor", "Messfläche freihalten, Kragen oder\nGitter anbringen."],
      ["Batterie ist nach\nWochen leer", "Der Ultraschallsensor wird\nnicht abgeschaltet", "MOSFET-Verdrahtung prüfen, besonders\nden 10-kΩ-Widerstand zwischen\nGate und GND."],
    ],
    [2100, 3100, 3870],
  ),
  abstand(140),
  kasten(
    "Wenn nichts davon passt",
    [
      "Schreiben Sie auf, was im Serial Monitor steht – die letzten zehn Zeilen genügen meist – und in welchem Kapitel Sie stehen. Damit lässt sich fast jedes Problem aus der Ferne einkreisen.",
      "Die technischen Einzelheiten stehen im Projekt unter docs/hardware.md (Schaltung, Stromverbrauch) und docs/anlernprozess.md (Anlernen, Kalibrierung).",
    ],
    "hinweis",
  ),
  new Paragraph({ children: [new PageBreak()] }),
);

// ======================================================================
// Anhang
// ======================================================================
füge(
  h1("Anhang A  Alle Adressen auf einen Blick"),
  tabelle(
    ["Wofür", "Adresse"],
    [
      ["Öffentliche Karte", ADRESSE],
      ["Anmeldung interner Bereich", ADRESSE + "/login"],
      ["Gerät aufnehmen", ADRESSE + "/intern/sensoren/neu"],
      ["Sensorliste und Etiketten", ADRESSE + "/intern/sensoren"],
      ["Sensor anlernen", ADRESSE + "/intern/sensoren/anlernen"],
      ["Quellcode und Dokumentation", REPO],
      ["Visual Studio Code", "code.visualstudio.com"],
      ["Datenblatt Ultraschallsensor", "wiki.dfrobot.com/sen0311"],
      ["Platine (Hersteller)", "lilygo.cc/products/t-sim7080-s3"],
      ["SIM-Karten", "1nce.com"],
    ],
    [3400, 5670],
  ),
  abstand(200),
  h1("Anhang B  Checkliste zum Abhaken"),
  p("Kopieren Sie diese Seite für jeden Sensor, den Sie bauen.", { leise: true }),
  abstand(60),
  ...[
    ["Einkauf", ["Alle Bauteile da", "Werkzeug vollständig", "USB-C-Datenkabel geprüft"]],
    ["Aufbau", ["Widerstände richtig zugeordnet", "Alle Lötstellen glänzen und halten", "Schrumpfschlauch überall drüber", "Durchgang gemessen, kein Kurzschluss zwischen 3V3 und GND"]],
    ["System", ["Gerät angelegt, Geräte-ID notiert", "Geräteschlüssel gesichert", "Etikett gedruckt und aufgeklebt"]],
    ["Software", ["VS Code und PlatformIO installiert", "geheimnisse.h angelegt und ausgefüllt", "Upload mit SUCCESS beendet"]],
    ["Test", ["Abstand wird gemessen und ändert sich", "Netzverbindung steht", "HTTP 200 im Protokoll", "Gerät erscheint in der Sensorliste", "Magnet löst Messung aus, LED blinkt", "Messgenauigkeit mit Zollstock geprüft"]],
    ["Einbau", ["Antenne AUSSEN angebracht", "Alle Durchführungen abgedichtet", "Sensor mittig, 3–5 cm unter dem Deckel", "Innenhöhe notiert", "Funkpegel geprüft"]],
    ["Anlernen", ["Sensor mit Container gekoppelt", "Leerwert übernommen oder eingetragen", "Container erscheint mit Füllstand auf der Karte"]],
  ].flatMap(([bereich, punkteListe]) => [
    h3(bereich),
    ...punkteListe.map(
      (text) =>
        new Paragraph({
          spacing: { after: 70, line: 276 },
          indent: { left: 200 },
          children: [
            new TextRun({ text: "☐   ", size: 24, color: FARBE.leise }),
            new TextRun({ text, size: 21, color: FARBE.text }),
          ],
        }),
    ),
  ]),
);

// ======================================================================
// Dokument bauen
// ======================================================================
const nummerierungen = [
  { reference: "striche", levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 340, hanging: 200 } } } }] },
  ...["schritte", "schritte2", "schritte3", "schritte4", "schritte5", "schritte6",
      "schritte7", "schritte8", "schritte9", "schritte10"].map((reference) => ({
    reference,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 420, hanging: 300 } } } }],
  })),
];

const dokument = new Document({
  creator: "BRK Kreisverband Miltenberg",
  title: "Füllstandsensor selbst bauen",
  description: "Schritt-für-Schritt-Bauanleitung für den Füllstandsensor der Altkleidercontainer",
  numbering: { config: nummerierungen },
  styles: {
    default: {
      document: { run: { font: "Calibri", size: 21, color: FARBE.text } },
    },
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1134, bottom: 1134, left: 1418, right: 1418 },
        },
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              border: { top: { style: BorderStyle.SINGLE, size: 2, color: FARBE.linie } },
              spacing: { before: 120 },
              children: [
                new TextRun({ text: "Füllstandsensor selbst bauen  ·  Seite ", size: 17, color: FARBE.leise }),
                new TextRun({ children: [PageNumber.CURRENT], size: 17, color: FARBE.leise }),
                new TextRun({ text: " von ", size: 17, color: FARBE.leise }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: FARBE.leise }),
              ],
            }),
          ],
        }),
      },
      children: inhalt,
    },
  ],
});

const ziel = path.join(__dirname, "..", "docs", "Sensor-Bauanleitung.docx");
Packer.toBuffer(dokument).then((puffer) => {
  fs.writeFileSync(ziel, puffer);
  console.log("geschrieben:", ziel, "(" + Math.round(puffer.length / 1024) + " KB)");
});

