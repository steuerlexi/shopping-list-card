// Shopping List Card v2.0.4 — AppDaemon backend edition (inline animated category icons).
//
// Source of truth is no longer a native HA `todo.*` entity but the AppDaemon
// middleware backend that publishes `sensor.einkaufsliste_backend`. The card
// fires `einkaufsliste_*` HA events via the WebSocket `fire_event` command and reads the
// full list from the sensor's `items` attribute. Auto-categorization,
// auto-dedup and uid-stable removal all happen server-side; the card only
// renders and emits intents.
//
// Config: { type: "custom:shopping-list-card", entity: "sensor.einkaufsliste_backend" }
// Legacy `todo.*` entities and the old `lists:` array are detected and render
// a migration warning instead of silently breaking.

class ShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this._unsub = null;
    this._autocompleteItems = null;
    this._iconMap = null;
    this._catMap = null;
    this._tileIndex = [];
    this._items = [];
    this._prevItems = null;
    this._fingerprint = 0;
    this._lastFingerprint = -1;
    this._entity = null;
    this._listId = "standard";
    this._color = "#43A047";
    this._legacyWarning = null;
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('Du musst "entity" (sensor.einkaufsliste_backend) konfigurieren.');
    }
    this._entity = config.entity;
    this._listId = config.list || "standard";
    this._color = config.color || "#43A047";

    // Legacy detection: old `todo.*` entity or the removed `lists:` array.
    let legacy = null;
    if (Array.isArray(config.lists)) {
      legacy = "Die alte `lists:`-Konfiguration wird nicht mehr unterstützt. Stelle auf `entity: sensor.einkaufsliste_backend` um (Backend-Setup siehe README).";
    } else if (typeof config.entity === "string" && config.entity.startsWith("todo.")) {
      legacy = "Diese Karte benötigt das AppDaemon-Backend (sensor.einkaufsliste_backend). Eine `todo.*`-Entity wird nicht mehr direkt unterstützt. Bitte Backend installieren (siehe README) und `entity: sensor.einkaufsliste_backend` setzen.";
    }
    this._legacyWarning = legacy;

    this.config = {
      title: "Einkaufen",
      icon_map: {},
      ...config
    };
    delete this.config.lists;

    this._initCaches();
    if (this._hass) this._fetchAndRender();
  }

  _initCaches() {
    if (this._cachesReady) return;
    this._autocompleteItems = [...new Set([
      "Apfel","Bananen","Birne","Kiwi","Orange","Mandarine","Trauben","Weintrauben","Kirschen","Erdbeeren","Himbeeren",
      "Pfirsich","Pflaume","Zitrone","Melone","Ananas","Mango","Avocado","Tomaten","Gurke","Paprika",
      "Karotten","Zucchini","Aubergine","Brokkoli","Blumenkohl","Spinat","Salat","Kartoffeln","Zwiebeln",
      "Knoblauch","Pilze","Champignons","Radieschen","Brot","Brötchen","Toast","Baguette","Kräuterbaguettes","Croissants",
      "Milch","Joghurt","Sahne","Butter","Käse","Schafskäse","Ofenkäse","Quark","Frischkäse","Mozzarella","Eier","Hähnchen",
      "Hackfleisch","Schnitzel","Wurst","Schinken","Aufschnitt","Steaks","Fisch","Lachs","Garnelen","Tofu","Bratwürstchen","Nudeln","Spaghetti",
      "Reis","Mehl","Zucker","Salz","Pfeffer","Olivenöl","Essig","Ketchup","Mayonnaise","Senf","Honig",
      "Marmelade","Tiefkühlpizza","Fischstäbchen","Pommes","Eis","Wasser","Saft","Cola","Bier","Wein","Weißwein","Rotwein",
      "Kaffee","Tee","Toilettenpapier","Küchenrolle","Shampoo","Duschgel","Seife","Zahnpasta","Waschmittel",
      "Weichspüler","Spülmittel","Schokolade","Kekse","Chips","Nüsse","Mandeln","TK-Gemüse","Müllbeutel",
      "Aprikose","Brombeeren","Clementine","Cranberry","Datteln","Feige","Granatapfel","Heidelbeeren",
      "Holunder","Johannisbeeren","Klementine","Mandarine","Nektarine","Pampelmuse","Preiselbeeren",
      "Rote Bete","Stachelbeeren","Wassermelone","Blattspinat","Chinakohl","Eisbergsalat","Feldsalat","Dill",
      "Kürbis","Lauch","Mais","Mangold","Pak Choi","Pastinake","Peperoni","Petersilie","Porree",
      "Rettich","Rosenkohl","Rotkohl","Rucola","Spargel","Süßkartoffel","Topinambur","Weißkohl",
      "Buttermilch","Camembert","Creme fraiche","Feta","Griechischer Joghurt","Kefir","Kochkäse",
      "Leerdammer","Milchreis","Ricotta","Calamari","Ente","Hähnchenbrust","Hähnchenkeule",
      "Kalbfleisch","Kassler","Lamm","Leber","Lunge","Putenbrust","Putenschnitzel","Rinderfilet",
      "Rinderhack","Rinderroulade","Rollmops","Sülze","Zander","Backpulver","Balsamico","Brühe",
      "Gnocchi","Haferflocken","Kartoffelstärke","Kichererbsen","Kidneybohnen","Linsen","Oliven",
      "Paniermehl","Pesto","Polenta","Rosinen","Sahnesteif","Sojasoße","Sonnenblumenöl","Soßenbinder",
      "Vanillezucker","Worcestersauce","Apfelschorle","Energydrink","Granatapfelsaft","Hugo",
      "Mineralwasser","Prosecco","Radler","Sekt","Smoothie","Sprudelwasser","Traubensaft",
      "Aufbackbrötchen","Blätterteig","Gemüsepfanne","Knödel","Kuchen","Lasagne","Maultaschen",
      "Nuggets","Paniertes","Piroggen","Ravioli","Reibekuchen","Schaschlik","Tortellini","Waffeln",
      "Wraps","Abwaschbürste","Alufolie","Backpapier","Bonbons","Deo","Desinfektionsmittel",
      "Drano","Feuchttücher","Frischhaltefolie","Geschirrtabs","Glühbirne","Haargel","Handcreme",
      "Handschuhe","Hustensaft","Insektenspray","Kerze","Kerzen","Klorollen","Kondome","Körperöl",
      "Küchentücher","Leinöl","Lotion","Lufterfrischer","Make-up","Mascara","Medikamente",
      "Milchreiniger","Mülltüten","Mundspülung","Nasenspray","Orangenschalen","Papiertüten",
      "Parfüm","Pfefferkörner","Pflaster","Rasierklingen","Rasierschaum","Räucherstäbchen",
      "Salbei","Sekt","Spülbürste","Staubsaugerbeutel","Streichhölzer","Taschentücher",
      "Teebaumöl","Toilettenreiniger","Zahnbürste","Zitronenmelisse","Zündhölzer","Bubblegum",
      "Gummibärchen","Kaugummi","Knuspermüsli","Lebkuchen","Lutscher","Marshmallow","Nougat",
      "Pralinen","Salzstangen","Studentenfutter","Trockenobst","Weinbrand"
    ])];

    this._iconMap = {
      eier:"1F95A", ei:"1F95A", apfel:"1F34E", äpfel:"1F34E", banane:"1F34C", bananen:"1F34C",
      birne:"1F350", birnen:"1F350", kiwi:"1F95D", orange:"1F34A", orangen:"1F34A",
      mandarine:"1F34A", traube:"1F347", trauben:"1F347", weintrauben:"1F347", kirsche:"1F352", kirschen:"1F352",
      erdbeere:"1F353", erdbeeren:"1F353", himbeere:"1F353", himbeeren:"1F353", holunder:"1F347",
      heidelbeere:"1FAD0", heidelbeeren:"1FAD0", pfirsich:"1F351", pflaume:"1F351",
      zitrone:"1F34B", limette:"1F34B", grapefruit:"1F34A", melone:"1F348", ananas:"1F34D",
      mango:"1F96D", avocado:"1F951", tomate:"1F345", tomaten:"1F345", gurke:"1F952",
      paprika:"1FAD1", karotte:"1F955", karotten:"1F955", zucchini:"1F955", aubergine:"1F346",
      brokkoli:"1F966", blumenkohl:"1F966", spinat:"1F96C", blattspinat:"1F96C", salat:"1F96C",
      kartoffel:"1F954", kartoffeln:"1F954", zwiebel:"1F9C5", zwiebeln:"1F9C5", knoblauch:"1F9C4",
      lauch:"1F96C", schnittlauch:"1F96C", dill:"1F33F", frühlingszwiebel:"1F9C5", schalotte:"1F9C5",
      radieschen:"1F955", sellerie:"1F96C", "rote bete":"1F345", rotebete:"1F345", pilz:"1F344",
      champignon:"1F344", champignons:"1F344", pfifferling:"1F344", steinpilz:"1F344", kräuterseitling:"1F344",
      austernpilz:"1F344", pilze:"1F344", gemüse:"1F955", obst:"1F353", frucht:"1F353",
      brot:"1F35E", brötchen:"1F35E", toast:"1F35E", semmel:"1F35E", baguette:"1F35E", "kräuterbaguette":"1F35E", "kräuterbaguettes":"1F35E",
      ciabatta:"1F35E", croissant:"1F950", croissants:"1F950", schrippe:"1F35E", weckle:"1F35E",
      laugenbrezel:"1F35E", brezel:"1F35E", milch:"1F95B", joghurt:"1FAD9", sahne:"1F95B",
      schmand:"1F95B", schlagsahne:"1F95B", butter:"1F9C8", käse:"1F9C0", quark:"1FAD9",
      frischkäse:"1F9C0", mozzarella:"1F9C0", brie:"1F9C0", gouda:"1F9C0", emmentaler:"1F9C0", ofenkäse:"1F9C0",
      parmesan:"1F9C0", "cream cheese":"1F9C0", mascarpone:"1F9C0", burrata:"1F9C0",
      cheddar:"1F9C0", fleisch:"1F969", steak:"1F969", hähnchen:"1F357", pute:"1F357",
      ente:"1F357", schinken:"1F953", speck:"1F953", wurst:"1F32D", bratwürstchen:"1F32D", salami:"1F32D",
      mettwurst:"1F32D", aufschnitt:"1F953", steaks:"1F969", schnitzel:"1F969", hackfleisch:"1F356", fisch:"1F41F", lachs:"1F41F",
      thunfisch:"1F41F", forelle:"1F41F", scholle:"1F41F", makrele:"1F41F", garnelen:"1F990",
      krabben:"1F990", tofu:"1F96C", "tk-gemüse":"2744", seitan:"1F969", vegan:"1F96C", vegetarisch:"1F96C",
      nudeln:"1F35D", spaghetti:"1F35D", penne:"1F35D", rigatoni:"1F35D", fettuccine:"1F35D",
      lasagne:"1F35D", reis:"1F35A", couscous:"1F35A", bulgur:"1F35A", mehl:"1F33E",
      zucker:"1F36C", salz:"1F9C2", pfeffer:"1F336", öl:"1F6E2", olivenöl:"1F6E2",
      essig:"1F9C2", soße:"1F963", ketchup:"1F345", mayo:"1F9C2", mayonnaise:"1F9C2",
      senf:"1F336", gewürz:"1F336", gewürze:"1F336", kräuter:"1F33F", vanille:"1F33F",
      zimt:"1F33F", honig:"1F36F", marmelade:"1F36F", nutella:"1F36F", aufstrich:"1F36F",
      kapern:"1F952", oliven:"1F95C", essiggurke:"1F952", sauerkraut:"1F96C",
      peperoni:"1F336", antipasti:"1F952", kaffee:"2615", espresso:"2615", cappuccino:"2615",
      tee:"1FAD6", bier:"1F37A", wein:"1F377", weißwein:"1F377", rotwein:"1F377",
      wasser:"1F4A7", getränke:"1F964", cola:"1F964", limonade:"1F964", sprite:"1F964",
      fanta:"1F964", apfelschorle:"1F964", saft:"1F9C3", orangensaft:"1F9C3", kapseln:"2615",
      kakao:"2615", tiefkühl:"2744", tiefkühlpizza:"1F355", pizza:"1F355", frikassee:"1F963",
      fischstäbchen:"1F41F", pommes:"1F35F", eis:"1F366", eiskrem:"1F366",
      toilettenpapier:"1F9FB", küchenrolle:"1F9FB", papier:"1F4C4", taschentuch:"1F9FB",
      waschmittel:"1F9FC", spülmittel:"1FAE7", spüli:"1FAE7", zahnpasta:"1FAE5",
      zahnbürste:"1FAE5", shampoo:"1F9FC", duschgel:"1F9FC", seife:"1F9FC",
      deodorant:"1F9F4", rasierer:"1FA92", dusch:"1F6BF", bad:"1F6BF", weichspüler:"1F9F5",
      reiniger:"1F9F9", tabs:"1F9FC", schokolade:"1F36B", kekse:"1F36A", chips:"1F35F",
      nüsse:"1F330", mandeln:"1F330", müllbeutel:"1F5D1", aprikose:"1F351",
      brombeeren:"1F347", clementine:"1F34A", klementine:"1F34A", cranberry:"1F347",
      datteln:"1F36C", feige:"1F34A", granatapfel:"1F347", johannisbeeren:"1F353",
      nektarine:"1F351", pampelmuse:"1F34A", preiselbeeren:"1F353", stachelbeeren:"1F353",
      wassermelone:"1F349", chinakohl:"1F96C", eisbergsalat:"1F96C", feldsalat:"1F96C",
      kürbis:"1F383", lauch:"1F96C", mais:"1F33D", mangold:"1F96C", "pak choi":"1F96C",
      pastinake:"1F955", petersilie:"1F33F", porree:"1F96C", rettich:"1F955",
      rosenkohl:"1F966", rotkohl:"1F966", rucola:"1F96C", spargel:"1F966",
      süßkartoffel:"1F360", topinambur:"1F954", weißkohl:"1F966", buttermilch:"1F95B",
      camembert:"1F9C0", "creme fraiche":"1F95B", feta:"1F9C0", schafskäse:"1F9C0",
      "griechischer joghurt":"1FAD9", kefir:"1F95B", kochkäse:"1F9C0", leerdammer:"1F9C0",
      milchreis:"1F35A", ricotta:"1F9C0", calamari:"1F991", ente:"1F357",
      hähnchenbrust:"1F357", hähnchenkeule:"1F357", kalbfleisch:"1F969", kassler:"1F953",
      lamm:"1F411", leber:"1F969", lunge:"1F969", putenbrust:"1F357",
      putenschnitzel:"1F357", rinderfilet:"1F969", rinderhack:"1F969",
      rinderroulade:"1F969", rollmops:"1F41F", sülze:"1F963", zander:"1F41F",
      backpulver:"1F9C2", balsamico:"1F9C2", brühe:"1F963", gnocchi:"1F35D",
      haferflocken:"1F33E", kartoffelstärke:"1F33E", kichererbsen:"1F96C",
      kidneybohnen:"1F96C", linsen:"1F96C", paniermehl:"1F33E", pesto:"1F33F",
      polenta:"1F35A", rosinen:"1F347", sahnesteif:"1F3FA", sojasoße:"1F963",
      sonnenblumenöl:"1F6E2", soßenbinder:"1F9C2", vanillezucker:"1F36C",
      worcestersauce:"1F9C2", energydrink:"1F964", granatapfelsaft:"1F9C3",
      hugo:"1F377", mineralwasser:"1F4A7", prosecco:"1F377", radler:"1F37A",
      sekt:"1F37E", smoothie:"1F964", sprudelwasser:"1F4A7", traubensaft:"1F9C3",
      aufbackbrötchen:"1F35E", blätterteig:"1F35E", gemüsepfanne:"1F966",
      knödel:"1F35D", kuchen:"1F370", lasagne:"1F35D", maultaschen:"1F35D",
      nuggets:"1F357", paniertes:"1F357", piroggen:"1F35D", ravioli:"1F35D",
      reibekuchen:"1F35F", schaschlik:"1F357", tortellini:"1F35D", waffeln:"1F367",
      wraps:"1F35D", abwaschbürste:"1FAE7", alufolie:"1F4E6", backpapier:"1F4C4",
      bonbons:"1F36C", deo:"1F9F4", desinfektionsmittel:"1F9F9", drano:"1F9F9",
      feuchttücher:"1F9FB", frischhaltefolie:"1F4E6", geschirrtabs:"1F9FC",
      glühbirne:"1F4A1", haargel:"1F9FC", handcreme:"1F9F5", handschuhe:"1F9E4",
      hustensaft:"1F9EA", insektenspray:"1F9F4", kerze:"1F56F", kerzen:"1F56F",
      klorollen:"1F9FB", kondome:"1F9F4", körperöl:"1F9F7", küchentücher:"1F9FB",
      leinöl:"1F6E2", lotion:"1F9F5", lufterfrischer:"1F33F", "make-up":"1F484",
      mascara:"1F484", medikamente:"1F48A", milchreiniger:"1F9FC", mülltüten:"1F5D1",
      mundspülung:"1F9F4", nasenspray:"1F9EA", orangenschalen:"1F34A",
      papiertüten:"1F4E6", parfüm:"1F484", pfefferkörner:"1F336", pflaster:"1F48A",
      rasierklingen:"1FA92", rasierschaum:"1FAE6", räucherstäbchen:"1F56F",
      salbei:"1F33F", spülbürste:"1FAE7", staubsaugerbeutel:"1F9F9",
      streichhölzer:"1F522", taschentücher:"1F9FB", teebaumöl:"1F33F",
      toilettenreiniger:"1F9F9", zahnbürste:"1FAE5", zitronenmelisse:"1F34B",
      zündhölzer:"1F522", bubblegum:"1F36C", gummibärchen:"1F36C", kaugummi:"1F36C",
      knuspermüsli:"1F33E", lebkuchen:"1F36A", lutscher:"1F36D", marshmallow:"1F36C",
      nougat:"1F36B", pralinen:"1F36B", salzstangen:"1F35F", studentenfutter:"1F330",
      trockenobst:"1F347", weinbrand:"1F377"
    };
    this._iconMapEntries = Object.entries(this._iconMap).sort((a, b) => b[0].length - a[0].length);

    this._catMap = [
      { key: "obst_gemuese", keys: new Set(["apfel","äpfel","banane","bananen","birne","birnen","kiwi","orange","orangen","mandarine","traube","trauben","weintrauben","kirsche","kirschen","erdbeere","erdbeeren","himbeere","himbeeren","heidelbeere","heidelbeeren","pfirsich","pflaume","zitrone","limette","grapefruit","melone","ananas","mango","obst","frucht","tomate","tomaten","gurke","paprika","karotte","karotten","zucchini","aubergine","brokkoli","blumenkohl","spinat","blattspinat","salat","kartoffel","kartoffeln","zwiebel","zwiebeln","knoblauch","lauch","schnittlauch","dill","frühlingszwiebel","schalotte","radieschen","sellerie","rote bete","rotebete","pilz","champignon","pfifferling","steinpilz","kräuterseitling","austernpilz","pilze","gemüse","avocado","aprikose","brombeeren","clementine","klementine","cranberry","datteln","feige","granatapfel","johannisbeeren","nektarine","pampelmuse","preiselbeeren","stachelbeeren","wassermelone","chinakohl","eisbergsalat","feldsalat","kürbis","mais","mangold","pak choi","pastinake","petersilie","porree","rettich","rosenkohl","rotkohl","rucola","spargel","süßkartoffel","topinambur","weißkohl","holunder","orangenschalen","salbei","zitronenmelisse","trockenobst"]) },
      { key: "brot_backwaren", keys: new Set(["brot","brötchen","toast","semmel","baguette","kräuterbaguette","kräuterbaguettes","ciabatta","croissant","schrippe","weckle","laugenbrezel","brezel","aufbackbrötchen","blätterteig","kuchen","wraps"]) },
      { key: "milch_eier", keys: new Set(["milch","joghurt","sahne","schmand","schlagsahne","butter","käse","quark","frischkäse","mozzarella","brie","gouda","emmentaler","parmesan","cream cheese","mascarpone","eier","burrata","cheddar","buttermilch","camembert","creme fraiche","feta","griechischer joghurt","kefir","kochkäse","leerdammer","milchreis","ricotta","schafskäse","ofenkäse"]) },
      { key: "fleisch_fisch", keys: new Set(["fleisch","steak","steaks","hähnchen","pute","ente","schinken","speck","wurst","bratwürstchen","aufschnitt","schnitzel","hackfleisch","salami","mettwurst","fisch","lachs","thunfisch","forelle","garnelen","krabben","scholle","makrele","tofu","seitan","vegan","vegetarisch","calamari","hähnchenbrust","hähnchenkeule","kalbfleisch","kassler","lamm","leber","lunge","putenbrust","putenschnitzel","rinderfilet","rinderhack","rinderroulade","rollmops","sülze","zander"]) },
      { key: "trockenwaren", keys: new Set(["nudeln","spaghetti","penne","rigatoni","fettuccine","lasagne","reis","couscous","bulgur","mehl","zucker","salz","pfeffer","olivenöl","sonnenblumenöl","speiseöl","essig","soße","ketchup","mayo","mayonnaise","senf","gewürz","gewürze","kräuter","vanille","zimt","honig","marmelade","nutella","aufstrich","kapern","oliven","essiggurke","sauerkraut","peperoni","antipasti","backpulver","balsamico","brühe","gnocchi","haferflocken","kartoffelstärke","kichererbsen","kidneybohnen","linsen","paniermehl","pesto","polenta","rosinen","sahnesteif","sojasoße","soßenbinder","vanillezucker","worcestersauce","schokolade","keks","chips","nüsse","mandeln","bonbons","bubblegum","gummibärchen","kaugummi","knuspermüsli","lebkuchen","lutscher","marshmallow","nougat","pralinen","salzstangen","studentenfutter","pfefferkörner"]) },
      { key: "tiefkuehlprodukte", keys: new Set(["tiefkühl","tiefkühlpizza","pizza","frikassee","fischstäbchen","pommes","eis","eiskrem","gemüsepfanne","knödel","nuggets","paniertes","piroggen","ravioli","reibekuchen","schaschlik","tortellini","tk-gemüse","waffeln"]) },
      { key: "getraenke", keys: new Set(["wasser","getränke","cola","saft","bier","wein","weißwein","rotwein","limonade","sprite","fanta","apfelschorle","kaffee","espresso","kapseln","kakao","tee","cappuccino","energydrink","granatapfelsaft","hugo","mineralwasser","prosecco","radler","sekt","smoothie","sprudelwasser","traubensaft"]) },
      { key: "haushalt_hygiene", keys: new Set(["toilettenpapier","küchenrolle","papier","taschentuch","shampoo","duschgel","seife","zahnpasta","zahnbürste","deodorant","rasierer","dusch","bad","waschmittel","weichspüler","reiniger","spülmittel","tabs","spüli","abwaschbürste","alufolie","backpapier","deo","desinfektionsmittel","drano","feuchttücher","frischhaltefolie","geschirrtabs","glühbirne","haargel","handcreme","handschuhe","hustensaft","insektenspray","kerze","kerzen","klorollen","kondome","körperöl","küchentücher","leinöl","lotion","lufterfrischer","make-up","mascara","medikamente","milchreiniger","mülltüten","müllbeutel","mundspülung","nasenspray","papiertüten","parfüm","pflaster","rasierklingen","rasierschaum","räucherstäbchen","spülbürste","staubsaugerbeutel","streichhölzer","taschentücher","teebaumöl","toilettenreiniger","zündhölzer"]) }
    ];
    this._catLookup = new Map();
    for (const cat of this._catMap) {
      for (const key of cat.keys) {
        this._catLookup.set(key, cat.key);
      }
    }
    this._catLookupEntries = [...this._catLookup.entries()].sort((a, b) => b[0].length - a[0].length);

    // Reverse map: backend publishes category NAME (e.g. "Obst & Gemüse"),
    // but grouping/icon/color need the canonical key. Fall back to summary scan.
    this._categoryNameToKey = {
      "Obst & Gemüse": "obst_gemuese",
      "Brot & Backwaren": "brot_backwaren",
      "Milchprodukte & Eier": "milch_eier",
      "Fleisch & Fisch": "fleisch_fisch",
      "Trockenwaren": "trockenwaren",
      "Tiefkühlprodukte": "tiefkuehlprodukte",
      "Getränke": "getraenke",
      "Haushalt & Hygiene": "haushalt_hygiene",
      "Sonstiges": "sonstiges"
    };

    // Animated inline SVG category icons. Embedded directly so CSS animations
    // run reliably (img/ha-icon cannot animate). Replace individual SVGs by
    // editing the strings below; the key names must stay stable.
    this._categorySvgs = {
      obst_gemuese: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-swing { animation: sl-cat-swing 2.5s ease-in-out infinite; transform-origin: 12px 5px; }
          @keyframes sl-cat-swing { 0%,100% { transform: rotate(-6deg); } 50% { transform: rotate(6deg); } }
        </style>
        <g class="sl-cat-swing">
          <path d="M12 6c-3 0-5.5 2-5.5 5.5S9 18 12 18s5.5-3 5.5-6.5S15 6 12 6z"/>
          <path d="M12 6c0-1.5.5-3 1.5-4" stroke="currentColor" stroke-width="1.5" fill="none"/>
          <path d="M12 6c2-.5 3.5-.5 4.5.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </g>
      </svg>`,
      brot_backwaren: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-rise { animation: sl-cat-rise 2s ease-in-out infinite; transform-origin: center bottom; }
          @keyframes sl-cat-rise { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.08); } }
        </style>
        <g class="sl-cat-rise">
          <path d="M5 9c0-3 3-5 7-5s7 2 7 5v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9z"/>
          <path d="M8 9c0-1 1.5-2 4-2s4 1 4 2" stroke="rgba(255,255,255,0.4)" stroke-width="1" fill="none"/>
        </g>
      </svg>`,
      milch_eier: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-tilt { animation: sl-cat-tilt 3s ease-in-out infinite; transform-origin: center bottom; }
          @keyframes sl-cat-tilt { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        </style>
        <g class="sl-cat-tilt">
          <path d="M7 5h10l2 4v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9l2-4z"/>
          <circle cx="12" cy="17" r="2" fill="rgba(255,255,255,0.5)"/>
        </g>
      </svg>`,
      fleisch_fisch: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-meat { animation: sl-cat-pulse 2s ease-in-out infinite; transform-origin: center; }
          .sl-cat-steam { animation: sl-cat-steam 2s ease-in-out infinite; }
          @keyframes sl-cat-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
          @keyframes sl-cat-steam { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
        </style>
        <g class="sl-cat-meat">
          <path d="M7 11c0-3 2.5-6 6-6s6 3 6 6-2.5 6-6 6-6-3-6-6z"/>
          <path d="M9 14l-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
        </g>
        <path class="sl-cat-steam" d="M9 6c0-1 1-2 1-3" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path class="sl-cat-steam" d="M15 6c0-1 1-2 1-3" stroke="currentColor" stroke-width="1.5" fill="none" style="animation-delay:0.5s"/>
      </svg>`,
      trockenwaren: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-wiggle { animation: sl-cat-wiggle 2.2s ease-in-out infinite; transform-origin: center bottom; }
          @keyframes sl-cat-wiggle { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-3deg); } 75% { transform: rotate(3deg); } }
        </style>
        <g class="sl-cat-wiggle">
          <path d="M4 7h16l2 4v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7z"/>
          <path d="M4 7l2-3h12l2 3" stroke="currentColor" stroke-width="1.5" fill="none"/>
        </g>
      </svg>`,
      tiefkuehlprodukte: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-flake { animation: sl-cat-spin 4s linear infinite; transform-origin: center; }
          .sl-cat-dot { animation: sl-cat-fade 1.8s ease-in-out infinite; }
          @keyframes sl-cat-spin { to { transform: rotate(360deg); } }
          @keyframes sl-cat-fade { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        </style>
        <g class="sl-cat-flake">
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none"/>
        </g>
        <circle class="sl-cat-dot" cx="8" cy="8" r="1"/>
        <circle class="sl-cat-dot" cx="16" cy="8" r="1" style="animation-delay:0.4s"/>
        <circle class="sl-cat-dot" cx="12" cy="16" r="1" style="animation-delay:0.8s"/>
      </svg>`,
      getraenke: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-bubble { animation: sl-cat-bubble 1.6s ease-in-out infinite; }
          @keyframes sl-cat-bubble { 0%,100% { transform: translateY(0); opacity: 0.5; } 50% { transform: translateY(-3px); opacity: 1; } }
        </style>
        <path d="M7 3h10l1 4v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7l1-4z"/>
        <circle class="sl-cat-bubble" cx="10" cy="14" r="1"/>
        <circle class="sl-cat-bubble" cx="14" cy="11" r="1.2" style="animation-delay:0.5s"/>
        <circle class="sl-cat-bubble" cx="12" cy="17" r="0.8" style="animation-delay:1s"/>
      </svg>`,
      haushalt_hygiene: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-scrub { animation: sl-cat-scrub 1.5s ease-in-out infinite; transform-origin: bottom right; }
          @keyframes sl-cat-scrub { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-10deg); } }
        </style>
        <g class="sl-cat-scrub">
          <path d="M7 4h10v4H7z"/>
          <path d="M8 8l-1 9h10l-1-9"/>
          <path d="M10 17h4" stroke="currentColor" stroke-width="2" fill="none"/>
        </g>
      </svg>`,
      sonstiges: `<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <style>
          .sl-cat-wag { animation: sl-cat-wag 2s ease-in-out infinite; transform-origin: center bottom; }
          @keyframes sl-cat-wag { 0%,100% { transform: rotate(0deg); } 25% { transform: rotate(-5deg); } 75% { transform: rotate(5deg); } }
        </style>
        <g class="sl-cat-wag">
          <path d="M5 6h2l2 11h8l2-9H7"/>
          <circle cx="10" cy="19" r="1.5"/>
          <circle cx="17" cy="19" r="1.5"/>
        </g>
      </svg>`
    };

    this._cachesReady = true;
  }

  set hass(hass) {
    if (!this.config || !hass?.states) return;
    const oldHass = this._hass;
    this._hass = hass;
    if (!oldHass) this._subscribeChanges();
    if (!oldHass || this._shouldRender(oldHass, hass)) this._fetchAndRender();
  }

  _fetchAndRender() {
    this._loadItems();
    this._render();
  }

  _loadItems() {
    const st = this._hass?.states?.[this._entity];
    if (!st) { this._items = []; return; }
    const all = Array.isArray(st.attributes?.items) ? st.attributes.items : [];
    this._items = all.filter(i => (i.list || "standard") === this._listId);
    let fp = 0;
    for (const i of this._items) {
      fp = (fp * 31 + this._hashString(i.uid + "|" + i.status + "|" + i.summary + "|" + (i.quantity || 1) + "|" + (i.icon || ""))) >>> 0;
    }
    this._fingerprint = fp;
  }

  _hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  _shouldRender(oldHass, newHass) {
    const a = oldHass.states?.[this._entity];
    const b = newHass.states?.[this._entity];
    if (!a || !b) return true;
    if (a.last_changed !== b.last_changed) return true;
    if (a.last_updated !== b.last_updated) return true;
    return false;
  }

  _updateCatVisibility(catWrap, visible) {
    const header = catWrap.querySelector(".sl-header");
    const grid = catWrap.querySelector(".sl-grid");
    if (header) header.style.display = visible > 0 ? "" : "none";
    if (grid) {
      if (visible > 0) {
        grid.style.display = grid.dataset.collapsed === "true" ? "none" : "grid";
      } else {
        grid.style.display = "none";
      }
    }
  }

  _filterVisible(listWrap, query) {
    const q = query?.toLowerCase() || "";
    let lastCat = null;
    let visibleInCat = 0;
    for (const entry of this._tileIndex || []) {
      if (entry.cat !== lastCat) {
        if (lastCat) this._updateCatVisibility(lastCat, visibleInCat);
        lastCat = entry.cat;
        visibleInCat = 0;
      }
      const match = !q || entry.summary.includes(q);
      entry.tile.style.display = match ? "flex" : "none";
      if (match) visibleInCat++;
    }
    if (lastCat) this._updateCatVisibility(lastCat, visibleInCat);
  }

  _getOpenmojiUrl(hex) {
    const base = this.config?.openmoji_base_url || "https://cdn.jsdelivr.net/npm/openmoji@17.0.0/color/svg";
    return `${base}/${hex}.svg`;
  }

  _createOpenmojiImg(hex, size) {
    const img = document.createElement("img");
    img.src = this._getOpenmojiUrl(hex);
    img.style.width = size + "px";
    img.style.height = size + "px";
    img.style.flexShrink = "0";
    img.style.objectFit = "contain";
    img.alt = "";
    img.onerror = () => {
      if (img.src !== this._getOpenmojiUrl("1F6D2")) {
        img.src = this._getOpenmojiUrl("1F6D2");
      }
    };
    return img;
  }

  _getItemIcon(text) {
    const t = text.toLowerCase();
    const map = this.config.icon_map || {};
    if (map[text] || map[t]) return map[text] || map[t];
    for (const [key, hex] of this._iconMapEntries) {
      if (t.includes(key)) return hex;
    }
    return "1F6D2";
  }

  _renderItemIcon(container, item, size) {
    const summary = item?.summary || "";
    const override = this.config.icon_map?.[summary] || this.config.icon_map?.[String(summary).toLowerCase()];
    let iconValue = override || item?.icon;
    if (!iconValue) iconValue = this._getItemIcon(summary);
    if (!iconValue) iconValue = "1F6D2";
    container.innerHTML = "";
    if (/^[a-z]+:/.test(String(iconValue))) {
      const el = document.createElement("ha-icon");
      el.setAttribute("icon", iconValue);
      el.style.cssText = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;color:inherit;`;
      container.appendChild(el);
    } else {
      container.appendChild(this._createOpenmojiImg(iconValue, size));
    }
  }

  _getItemCategory(text) {
    const t = text.toLowerCase();
    for (const [key, catKey] of this._catLookupEntries) {
      if (t.includes(key)) return catKey;
    }
    return "sonstiges";
  }

  _itemCategoryKey(item) {
    const cat = item?.category;
    if (cat && this._categoryNameToKey[cat]) return this._categoryNameToKey[cat];
    return this._getItemCategory(item?.summary || "");
  }

  _getCategoryName(key) {
    return {
      obst_gemuese: "Obst & Gemüse",
      brot_backwaren: "Brot & Backwaren",
      milch_eier: "Milchprodukte & Eier",
      fleisch_fisch: "Fleisch & Fisch",
      trockenwaren: "Trockenwaren",
      tiefkuehlprodukte: "Tiefkühlprodukte",
      getraenke: "Getränke",
      haushalt_hygiene: "Haushalt & Hygiene",
      sonstiges: "Sonstiges"
    }[key] || key;
  }

  _getCategoryIcon(key) {
    // Returns the OpenMoji hex code used by legacy category_icon_mode "openmoji".
    // Default "inline" mode uses _categorySvgs instead.
    if (this.config?.category_icon_mode === "fam" || this.config?.category_icon_mode === "local") {
      return key || "sonstiges";
    }
    return {
      obst_gemuese: "1F955",
      brot_backwaren: "1F35E",
      milch_eier: "1F9C0",
      fleisch_fisch: "1F357",
      trockenwaren: "1F4E6",
      tiefkuehlprodukte: "2744",
      getraenke: "1F964",
      haushalt_hygiene: "1F9F9",
      sonstiges: "1F6D2"
    }[key] || "1F6D2";
  }

  _renderCategoryIcon(container, key, size, options = "") {
    const mode = this.config?.category_icon_mode || "inline";
    container.innerHTML = "";
    key = key || "sonstiges";
    if (mode === "inline") {
      // Default: embedded animated SVG. Animations only work when the SVG is
      // part of the DOM, not when referenced via img or ha-icon.
      const svgHtml = this._categorySvgs?.[key] || this._categorySvgs?.sonstiges;
      if (svgHtml) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = svgHtml.trim();
        const svg = wrapper.firstElementChild;
        if (svg) {
          svg.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;${options}`;
          container.appendChild(svg);
          return;
        }
      }
      // Fallback to OpenMoji if the inline SVG map is missing.
      const img = this._createOpenmojiImg(this._getCategoryIcon(key), size);
      if (options) img.style.cssText += options;
      container.appendChild(img);
      return;
    }
    if (mode === "fam") {
      const iconSet = window.customIcons?.fam;
      let svgBody = null;
      if (iconSet && typeof iconSet.getIcon === "function") {
        const icon = iconSet.getIcon(key);
        if (icon && icon.path) svgBody = icon.path;
      }
      if (svgBody) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "currentColor");
        svg.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;${options}`;
        svg.innerHTML = svgBody;
        container.appendChild(svg);
        return;
      }
      const el = document.createElement("ha-icon");
      el.setAttribute("icon", `fam:${key}`);
      el.style.cssText = `display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;color:inherit;${options}`;
      container.appendChild(el);
      return;
    }
    if (mode === "local") {
      const base = this.config?.category_icon_base_url || this.config?.openmoji_base_url || "/local/icons";
      const img = document.createElement("img");
      img.src = `${base}/${key || "sonstiges"}.svg`;
      img.style.width = size + "px";
      img.style.height = size + "px";
      img.style.flexShrink = "0";
      img.style.objectFit = "contain";
      img.style.cssText += options;
      img.alt = "";
      img.onerror = () => { img.src = `${base}/sonstiges.svg`; };
      container.appendChild(img);
      return;
    }
    // legacy openmoji
    const img = this._createOpenmojiImg(this._getCategoryIcon(key), size);
    if (options) img.style.cssText += options;
    container.appendChild(img);
  }

  _getCategoryColor(key) {
    return {
      obst_gemuese: "var(--shopping-list-cat-obst, #E67E22)",
      brot_backwaren: "var(--shopping-list-cat-brot, #D35400)",
      milch_eier: "var(--shopping-list-cat-milch, #F39C12)",
      fleisch_fisch: "var(--shopping-list-cat-fleisch, #E74C3C)",
      trockenwaren: "var(--shopping-list-cat-trocken, #8E44AD)",
      tiefkuehlprodukte: "var(--shopping-list-cat-tiefkuehl, #3498DB)",
      getraenke: "var(--shopping-list-cat-getraenke, #1ABC9C)",
      haushalt_hygiene: "var(--shopping-list-cat-haushalt, #9B59B6)",
      sonstiges: "var(--shopping-list-cat-sonstiges, #7F8C8D)"
    }[key] || "var(--shopping-list-cat-sonstiges, #7F8C8D)";
  }

  _getAutocompleteItems() {
    return this._autocompleteItems;
  }

  _findItemBySummary(text) {
    return this._items.find(item => item.summary.toLowerCase() === text.toLowerCase()) || null;
  }

  _showToast(msg) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--sl-toast-bg);color:var(--sl-toast-text);padding:10px 18px;border-radius:24px;font-size:14px;z-index:800;opacity:0;transition:opacity 0.3s ease;";
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.style.opacity = "1");
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  _haptic(ms = 50) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // Send a command to the AppDaemon backend. Non-admin users cannot use the
  // WebSocket `fire_event` command (it returns "Unauthorized"), so we write a
  // JSON payload into input_text.einkaufsliste_command via the regular
  // input_text/set_value service, which AppDaemon listens to with listen_state.
  // The backend clears the input after executing the command.
  _fireEvent(eventType, data) {
    if (!this._hass) {
      console.warn("Shopping List Card: no HA connection, cannot send", eventType);
      this._showToast("Fehler: keine HA-Verbindung");
      return;
    }
    const payload = JSON.stringify({ event: eventType, data: data || {} });
    const call = (fn) => {
      try {
        fn();
      } catch (e) {
        console.warn("Shopping List Card: command send failed", eventType, e);
        this._showToast("Fehler: " + (e.message || "Befehl fehlgeschlagen"));
      }
    };

    if (typeof this._hass.callService === "function") {
      call(() => this._hass.callService("input_text", "set_value", {
        entity_id: "input_text.einkaufsliste_command",
        value: payload
      }));
      return;
    }

    // Fallback for very old card runtimes: try the WebSocket fire_event command.
    // This requires admin privileges and will fail for non-admin users.
    if (this._hass?.connection) {
      this._hass.connection.sendMessagePromise({
        type: "fire_event",
        event_type: eventType,
        event_data: data || {}
      }).catch(e => {
        console.warn("Shopping List Card: fire_event failed", eventType, e);
        this._showToast("Fehler: " + (e.message || "Event fehlgeschlagen"));
      });
      return;
    }

    console.warn("Shopping List Card: no way to send command", eventType);
    this._showToast("Fehler: keine HA-Verbindung");
  }

  _addItem(text) {
    const val = String(text || "").trim();
    if (!val || !this._hass) return;
    this._fireEvent("einkaufsliste_add", { summary: val, quantity: 1, list: this._listId });
    this._haptic(60);
  }

  _toggleItem(item) {
    if (!this._hass || !item) return;
    this._fireEvent("einkaufsliste_toggle", { uid: item.uid });
    this._haptic(item.status === "needs_action" ? 60 : 40);
  }

  _removeItem(item) {
    if (!this._hass || !item) return;
    this._fireEvent("einkaufsliste_remove", { uid: item.uid });
    this._haptic(40);
  }

  _clearDone() {
    if (!this._hass) return;
    this._fireEvent("einkaufsliste_clear_completed", { list: this._listId });
    this._haptic(80);
  }

  _updateQuantity(item, delta) {
    if (!this._hass || !item) return;
    const q = Math.max(0, (item.quantity || 1) + delta);
    this._fireEvent("einkaufsliste_update", { uid: item.uid, quantity: q });
    this._haptic(40);
  }

  _subscribeChanges() {
    if ((this._unsub || this._unsubEvents) || !this._hass || !this.isConnected) return;
    const entities = [this._entity];
    // Primary: compressed entity subscription (efficient). BUT it may not
    // deliver attribute-only updates for AppDaemon REST-set states — e.g.
    // deleting a *completed* item doesn't change the active count (state),
    // only the `items` attribute, so subscribe_entities can skip it and leave
    // a stale tile in the DOM. The state_changed subscription below closes
    // that gap.
    this._hass.connection.subscribeMessage(
      () => { this._fetchAndRender(); },
      { type: "subscribe_entities", entity_ids: entities }
    ).then(unsub => { this._unsub = unsub; }).catch(() => { this._unsub = null; });
    // Secondary: state_changed fires reliably for EVERY set_state, including
    // attribute-only changes. Filtered to our entity. The fingerprint check in
    // _render() collapses duplicate renders when both subscriptions fire.
    this._unsubEvents = this._hass.connection.subscribeEvents(ev => {
      if (ev.data?.entity_id === this._entity) this._fetchAndRender();
    }, "state_changed");
  }

  connectedCallback() {
    if (this._hass) this._subscribeChanges();
  }
  disconnectedCallback() {
    if (this._unsub) {
      Promise.resolve(this._unsub).then(fn => fn());
      this._unsub = null;
    }
    if (this._unsubEvents) {
      Promise.resolve(this._unsubEvents).then(fn => fn());
      this._unsubEvents = null;
    }
  }

  _lightUpdate() {
    const itemMap = new Map();
    for (const item of this._items) itemMap.set(item.uid, item);
    const color = this._color;

    const tiles = this.querySelectorAll(".sl-tile:not(.sl-ghost)");
    for (const tile of tiles) {
      const item = itemMap.get(tile.dataset.uid);
      if (!item) { tile.remove(); continue; } // stale tile (item deleted in backend)
      const isDone = item.status === "completed";
      const qty = String(item.quantity || 1);
      if (tile.dataset.status === item.status && tile.dataset.qty === qty) continue;
      tile.dataset.status = item.status;
      tile.dataset.qty = qty;
      tile.style.background = isDone ? "var(--sl-bg)" : color;
      tile.style.border = isDone ? "2px solid var(--sl-border)" : "none";
      tile.style.opacity = isDone ? "0.55" : "1";

      const label = tile.querySelector(".sl-label");
      if (label) label.style.color = isDone ? "var(--sl-text-muted)" : "#fff";

      // Quantity badge ("Nx") — replaces the old free-text description badge.
      let badge = tile.querySelector(".sl-badge");
      const showBadge = (item.quantity || 1) > 1;
      if (showBadge) {
        const txt = (item.quantity || 1) + "x";
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "sl-badge";
          badge.style.cssText = "display:inline-block;padding:2px 6px;border-radius:8px;background:" + (isDone ? "var(--sl-border)" : "rgba(255,255,255,0.25)") + ";color:" + (isDone ? "var(--sl-text-muted)" : "#fff") + ";font-size:9px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;";
          tile.appendChild(badge);
        }
        badge.textContent = txt;
        badge.style.background = isDone ? "var(--sl-border)" : "rgba(255,255,255,0.25)";
        badge.style.color = isDone ? "var(--sl-text-muted)" : "#fff";
      } else if (badge) {
        badge.remove();
      }
    }

    const cats = this.querySelectorAll(".sl-cat");
    for (const cat of cats) {
      const header = cat.querySelector(".sl-header");
      const grid = cat.querySelector(".sl-grid");
      if (!header || !grid) continue;
      const countEl = header.querySelector(".sl-count");
      if (!countEl) continue;
      const visible = grid.querySelectorAll('.sl-tile:not(.sl-ghost)[data-status="needs_action"]').length;
      countEl.textContent = visible;
    }
  }

  _pruneStaleModal() {
    const modal = document.querySelector(".shopping-list-modal");
    if (!modal) return;
    const uid = modal.dataset.itemUid;
    if (!uid) return;
    const cur = this._items.find(i => i.uid === uid);
    if (!cur) { modal.remove(); return; }
    const qtyEl = modal.querySelector(".sl-modal-qty");
    if (qtyEl) qtyEl.textContent = String(cur.quantity || 1);
  }

  _renderSearchBar() {
    const listWrap = document.createElement("div");
    listWrap.style.cssText = "margin-bottom:14px;position:relative;";
    const color = this._color;

    const searchWrap = document.createElement("div");
    searchWrap.style.cssText = "display:flex;align-items:center;background:var(--sl-bg-input);border-radius:12px;padding:0 12px;border:1px solid var(--sl-border);";
    const searchIcon = document.createElement("ha-icon");
    searchIcon.setAttribute("icon", "mdi:magnify");
    searchIcon.style.cssText = "color:var(--sl-text-muted);width:20px;height:20px;margin-right:8px;";
    searchWrap.appendChild(searchIcon);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Artikel suchen oder hinzufügen...";
    input.style.cssText = "flex:1;border:none;background:transparent;font-size:16px;padding:12px 0;outline:none;color:var(--sl-text);";
    searchWrap.appendChild(input);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+";
    addBtn.style.cssText = "background:transparent;color:var(--sl-text-muted);border:none;border-radius:50%;width:32px;height:32px;font-size:22px;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    searchWrap.appendChild(addBtn);
    listWrap.appendChild(searchWrap);

    if (this._items.length === 0) {
      const emptyRow = document.createElement("div");
      emptyRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 4px;color:var(--sl-text-muted);font-size:13px;";
      const ic = document.createElement("ha-icon");
      ic.setAttribute("icon", "mdi:cart-outline");
      ic.style.cssText = "width:16px;height:16px;color:var(--sl-text-muted);";
      emptyRow.appendChild(ic);
      const t = document.createElement("span");
      t.textContent = "Noch nichts auf der Liste – unten tippen oder oben eingeben.";
      emptyRow.appendChild(t);
      listWrap.appendChild(emptyRow);
    }

    const acDropdown = document.createElement("div");
    acDropdown.style.cssText = "position:absolute;top:100%;left:0;right:0;background:var(--sl-bg);border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:100;max-height:200px;overflow-y:auto;display:none;";
    listWrap.appendChild(acDropdown);
    let acMouseDown = false;
    acDropdown.addEventListener("mousedown", () => { acMouseDown = true; });

    const acItems = this._getAutocompleteItems();
    let searchTimer = null;
    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      searchTimer && clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchTimer = null;
        acDropdown.innerHTML = "";
        this._filterVisible(listWrap, val);
        if (!val) { acDropdown.style.display = "none"; return; }
          const matches = acItems.filter(it => {
          const existing = this._findItemBySummary(it);
          return it.toLowerCase().includes(val) && !(existing && existing.status === "needs_action");
        }).slice(0, 8);
        if (matches.length) {
        matches.forEach(m => {
          const row = document.createElement("div");
          row.style.cssText = "padding:10px 16px;cursor:pointer;font-size:15px;color:var(--sl-text);border-bottom:1px solid var(--sl-border);";
          row.textContent = m;
          row.addEventListener("mouseenter", () => row.style.background = "var(--sl-hover)");
          row.addEventListener("mouseleave", () => row.style.background = "var(--sl-bg)");
          row.addEventListener("click", () => { this._addItem(m); input.value = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); });
          acDropdown.appendChild(row);
        });
        acDropdown.style.display = "block";
      } else {
        acDropdown.style.display = "none";
      }
      }, 150);
    });

    const doAdd = () => {
      if (input.value.trim()) { this._addItem(input.value); input.value = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); }
    };
    addBtn.addEventListener("click", doAdd);
    input.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
    input.addEventListener("focusout", (e) => {
      if (!acMouseDown && !acDropdown.contains(e.relatedTarget)) {
        acDropdown.style.display = "none";
        if (!input.value.trim()) this._filterVisible(listWrap, "");
      }
      acMouseDown = false;
    });
    input.addEventListener("focus", () => { if (input.value.trim()) input.dispatchEvent(new Event("input")); });

    return listWrap;
  }

  _renderCategory(cat, catItems) {
    const catWrap = document.createElement("div");
    catWrap.className = "sl-cat";
    catWrap.style.marginBottom = "16px";

    const header = document.createElement("div");
    header.className = "sl-header";
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--sl-border);cursor:pointer;user-select:none;";
    header.setAttribute("role", "button");
    header.setAttribute("tabindex", "0");
    header.setAttribute("aria-expanded", "true");
    const catColor = this._getCategoryColor(cat);
    const showCatLabels = this.config?.show_category_labels === true;
    const catIconSize = showCatLabels ? 20 : 28;
    const catIconWrap = document.createElement("div");
    catIconWrap.style.cssText = `display:flex;align-items:center;justify-content:center;color:${catColor};`;
    this._renderCategoryIcon(catIconWrap, cat, catIconSize);
    const catIconEl = catIconWrap.firstElementChild;
    if (catIconEl) catIconEl.style.filter = "drop-shadow(0 0 1px rgba(0,0,0,0.2))";
    header.appendChild(catIconWrap);
    if (showCatLabels) {
      const catName = document.createElement("div");
      catName.style.cssText = "font-weight:500;font-size:14px;flex:1;color:" + catColor;
      catName.textContent = this._getCategoryName(cat);
      header.appendChild(catName);
    } else {
      const spacer = document.createElement("div");
      spacer.style.cssText = "flex:1;";
      header.appendChild(spacer);
    }
    const count = document.createElement("div");
    count.className = "sl-count";
    count.style.cssText = "font-size:12px;color:var(--sl-text-muted);font-weight:400;";
    count.textContent = catItems.length;
    header.appendChild(count);
    const chevron = document.createElement("ha-icon");
    chevron.setAttribute("icon", "mdi:chevron-down");
    chevron.style.cssText = "color:var(--sl-text-muted);width:18px;height:18px;";
    header.appendChild(chevron);
    catWrap.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "sl-grid";
    let collapsed = false;
    const toggle = () => {
      collapsed = !collapsed;
      grid.style.display = collapsed ? "none" : "grid";
      grid.dataset.collapsed = collapsed ? "true" : "";
      chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
      header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });

    const color = this._color;
    for (const item of catItems) {
      const tile = this._renderTile(item, catWrap);
      tile.dataset.section = "active";
      grid.appendChild(tile);
    }

    const addTile = document.createElement("div");
    addTile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border-radius:12px;border:2px dashed " + color + "60;background:var(--sl-bg);cursor:pointer;min-height:72px;transition:all 0.15s;position:relative;";
    const plusIcon = document.createElement("ha-icon");
    plusIcon.setAttribute("icon", "mdi:plus");
    plusIcon.style.cssText = "color:" + color + ";width:22px;height:22px;";
    addTile.appendChild(plusIcon);
    addTile.addEventListener("mouseenter", () => { addTile.style.background = "var(--sl-hover)"; addTile.style.borderColor = color; });
    addTile.addEventListener("mouseleave", () => { addTile.style.background = "var(--sl-bg)"; addTile.style.borderColor = color + "60"; });
    let tileInput = null;
    let tileAcMouseDown = false;
    addTile.addEventListener("click", () => {
      if (!tileInput) {
        addTile.innerHTML = "";
        const tileAc = document.createElement("div");
        tileAc.style.cssText = "position:absolute;top:100%;left:50%;transform:translateX(-50%);width:min(180px,80vw);background:var(--sl-bg);border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:200;max-height:160px;overflow-y:auto;display:none;";
        tileAc.addEventListener("mousedown", () => { tileAcMouseDown = true; });
        tileInput = document.createElement("input");
        tileInput.type = "text";
        tileInput.placeholder = "...";
        tileInput.style.cssText = "width:100%;border:none;background:transparent;color:var(--sl-text);font-size:13px;text-align:center;outline:none;";
        const allItems = this._getAutocompleteItems();
        const resetTile = () => {
          addTile.innerHTML = "";
          const pi = document.createElement("ha-icon");
          pi.setAttribute("icon", "mdi:plus");
          pi.style.cssText = "color:" + color + ";width:22px;height:22px;";
          addTile.appendChild(pi);
          tileInput = null;
        };
        tileInput.addEventListener("input", () => {
          const v = tileInput.value.toLowerCase().trim();
          tileAc.innerHTML = "";
          if (!v) { tileAc.style.display = "none"; return; }
          const matches = allItems.filter(it => {
            const existing = this._findItemBySummary(it);
            return it.toLowerCase().includes(v) && !(existing && existing.status === "needs_action");
          }).slice(0, 6);
          if (matches.length) {
            matches.forEach(m => {
              const row = document.createElement("div");
              row.style.cssText = "padding:8px 12px;cursor:pointer;font-size:13px;color:var(--sl-text);border-bottom:1px solid var(--sl-border);";
              row.textContent = m;
              row.addEventListener("mouseenter", () => row.style.background = "var(--sl-hover)");
              row.addEventListener("mouseleave", () => row.style.background = "var(--sl-bg)");
              row.addEventListener("click", () => { this._addItem(m); resetTile(); });
              tileAc.appendChild(row);
            });
            tileAc.style.display = "block";
          } else {
            tileAc.style.display = "none";
          }
        });
        tileInput.addEventListener("keydown", e => { if (e.key === "Enter") { this._addItem(tileInput.value); resetTile(); } });
        tileInput.addEventListener("blur", () => { setTimeout(() => { if (!tileAcMouseDown && tileInput) resetTile(); tileAcMouseDown = false; }, 300); });
        addTile.appendChild(tileInput);
        addTile.appendChild(tileAc);
        tileInput.focus();
      }
    });
    grid.appendChild(addTile);
    catWrap.appendChild(grid);
    return catWrap;
  }

  _renderMirrorSection(items, order, maxPerCat = 20) {
    const onListSummaries = new Set(items.filter(i => i.status === "needs_action").map(i => i.summary.toLowerCase()));
    const itemBySummary = new Map();
    for (const item of items) itemBySummary.set(item.summary.toLowerCase(), item);
    const allArticles = this._getAutocompleteItems();
    const allAvail = [];
    const acLower = new Set(allArticles.map(a => a.toLowerCase()));
    for (const text of allArticles) {
      if (onListSummaries.has(text.toLowerCase())) continue;
      allAvail.push(text);
    }
    const completedExtras = items.filter(i => i.status === "completed" && !acLower.has(i.summary.toLowerCase()) && !onListSummaries.has(i.summary.toLowerCase()));
    for (const ci of completedExtras) {
      if (!allAvail.includes(ci.summary)) allAvail.push(ci.summary);
    }
    if (allAvail.length === 0) return null;

    const availByCat = {};
    for (const text of allAvail) {
      const cat = this._getItemCategory(text);
      if (!availByCat[cat]) availByCat[cat] = [];
      availByCat[cat].push(text);
    }

    let hasAnyLimit = false;
    for (const cat of order) {
      if (availByCat[cat] && availByCat[cat].length > maxPerCat) { hasAnyLimit = true; break; }
    }

    const color = this._color;
    const mirrorWrap = document.createElement("div");
    mirrorWrap.style.cssText = "margin-top:24px;padding-top:16px;border-top:2px dashed var(--sl-border);";

    const mirrorTitle = document.createElement("div");
    mirrorTitle.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px;";
    const checkIcon = document.createElement("ha-icon");
    checkIcon.setAttribute("icon", "mdi:check-circle");
    checkIcon.style.cssText = "color:var(--sl-text-muted);width:20px;height:20px;";
    mirrorTitle.appendChild(checkIcon);
    const mt = document.createElement("div");
    mt.style.cssText = "font-weight:600;font-size:14px;color:var(--sl-text-muted);flex:1;";
    mt.textContent = "Verfügbar (" + allAvail.length + ")";
    mirrorTitle.appendChild(mt);
    const clearAll = document.createElement("div");
    clearAll.textContent = "erledigte löschen";
    clearAll.style.cssText = "font-size:11px;color:var(--sl-text-muted);cursor:pointer;";
    clearAll.addEventListener("click", () => this._clearDone());
    mirrorTitle.appendChild(clearAll);
    mirrorWrap.appendChild(mirrorTitle);

    const mirrorOrder = [...new Set([...order, ...Object.keys(availByCat)])];
    for (const cat of mirrorOrder) {
      if (!availByCat[cat]) continue;
      const fullCatTexts = availByCat[cat];
      const isLimited = fullCatTexts.length > maxPerCat;
      const catTexts = isLimited ? fullCatTexts.slice(0, maxPerCat) : fullCatTexts;
      const catWrap = document.createElement("div");
      catWrap.className = "sl-cat";
      catWrap.style.marginBottom = "12px";

      const header = document.createElement("div");
      header.className = "sl-header";
      header.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--sl-border);cursor:pointer;user-select:none;";
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", "true");
      const showCatLabels = this.config?.show_category_labels === true;
      const catIconSize = showCatLabels ? 16 : 22;
      const catIconWrap = document.createElement("div");
      catIconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;color:var(--sl-text-muted);";
      this._renderCategoryIcon(catIconWrap, cat, catIconSize);
      const catIconEl = catIconWrap.firstElementChild;
      if (catIconEl) catIconEl.style.filter = "grayscale(100%) opacity(0.6)";
      header.appendChild(catIconWrap);
      if (showCatLabels) {
        const catName = document.createElement("div");
        catName.style.cssText = "font-weight:500;font-size:12px;flex:1;color:var(--sl-text-muted);";
        catName.textContent = this._getCategoryName(cat);
        header.appendChild(catName);
      } else {
        const spacer = document.createElement("div");
        spacer.style.cssText = "flex:1;";
        header.appendChild(spacer);
      }
      const count = document.createElement("div");
      count.className = "sl-count";
      count.style.cssText = "font-size:11px;color:var(--sl-text-muted);font-weight:400;";
      count.textContent = fullCatTexts.length;
      header.appendChild(count);
      const chevron = document.createElement("ha-icon");
      chevron.setAttribute("icon", "mdi:chevron-down");
      chevron.style.cssText = "color:var(--sl-text-muted);width:16px;height:16px;";
      header.appendChild(chevron);
      catWrap.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "sl-grid";
      grid.style.cssText = "gap:8px;padding:8px;transition:max-height 0.3s ease;";
      let collapsed = false;
      const toggle = () => {
        collapsed = !collapsed;
        grid.style.display = collapsed ? "none" : "grid";
        grid.dataset.collapsed = collapsed ? "true" : "";
        chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
      };
      header.addEventListener("click", toggle);
      header.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });

      for (const text of catTexts) {
        const existing = itemBySummary.get(text.toLowerCase());
        if (existing) {
          const tile = this._renderTile(existing, catWrap);
          tile.dataset.section = "mirror";
          grid.appendChild(tile);
        } else {
          grid.appendChild(this._renderGhostTile(text, catWrap));
        }
      }

      if (isLimited) {
        const loadMore = document.createElement("div");
        loadMore.style.cssText = "display:flex;align-items:center;justify-content:center;padding:8px;border-radius:12px;background:var(--sl-bg-input);border:1px dashed var(--sl-border);cursor:pointer;margin-top:4px;grid-column:1 / -1;transition:all 0.15s;";
        loadMore.textContent = "Mehr laden (" + (fullCatTexts.length - catTexts.length) + ")";
        loadMore.style.fontSize = "12px";
        loadMore.style.color = "var(--sl-text-muted)";
        loadMore.addEventListener("mouseenter", () => { loadMore.style.background = "var(--sl-hover)"; loadMore.style.borderColor = color; });
        loadMore.addEventListener("mouseleave", () => { loadMore.style.background = "var(--sl-bg-input)"; loadMore.style.borderColor = "var(--sl-border)"; });
        let expanded = false;
        loadMore.addEventListener("click", () => {
          if (expanded) return;
          expanded = true;
          loadMore.remove();
          for (let i = maxPerCat; i < fullCatTexts.length; i++) {
            const text = fullCatTexts[i];
            const existing = itemBySummary.get(text.toLowerCase());
            if (existing) {
              const tile = this._renderTile(existing, catWrap);
              tile.dataset.section = "mirror";
              grid.appendChild(tile);
            } else {
              grid.appendChild(this._renderGhostTile(text, catWrap));
            }
          }
        });
        grid.appendChild(loadMore);
      }

      catWrap.appendChild(grid);
      mirrorWrap.appendChild(catWrap);
    }

    if (hasAnyLimit) {
      const showAll = document.createElement("div");
      showAll.style.cssText = "display:flex;align-items:center;justify-content:center;padding:10px;border-radius:12px;background:var(--sl-bg-input);border:1px dashed var(--sl-border);cursor:pointer;margin-top:8px;transition:all 0.15s;";
      showAll.textContent = "Alle Artikel anzeigen";
      showAll.style.fontSize = "13px";
      showAll.style.color = "var(--sl-text-sec)";
      showAll.addEventListener("mouseenter", () => { showAll.style.background = "var(--sl-hover)"; showAll.style.borderColor = color; });
      showAll.addEventListener("mouseleave", () => { showAll.style.background = "var(--sl-bg-input)"; showAll.style.borderColor = "var(--sl-border)"; });
      showAll.addEventListener("click", () => {
        const newMirror = this._renderMirrorSection(items, order, Infinity);
        if (newMirror) mirrorWrap.replaceWith(newMirror);
      });
      mirrorWrap.appendChild(showAll);
    }

    return mirrorWrap;
  }

  _render() {
    if (!this.config) return;
    this._tileIndex = [];

    const existingCard = this.querySelector("ha-card");
    if (existingCard && this._fingerprint === this._lastFingerprint) {
      let sectionChanged = false;
      const itemMap = new Map();
      for (const item of this._items) itemMap.set(item.uid, item);
      const tiles = existingCard.querySelectorAll(".sl-tile:not(.sl-ghost)");
      for (const tile of tiles) {
        const item = itemMap.get(tile.dataset.uid);
        if (!item) { sectionChanged = true; break; } // stale tile -> force full rebuild
        const expected = item.status === "needs_action" ? "active" : "mirror";
        if (tile.dataset.section !== expected) { sectionChanged = true; break; }
      }
      if (!sectionChanged) {
        this._lightUpdate();
        this._pruneStaleModal();
        return;
      }
    }
    this._lastFingerprint = this._fingerprint;

    const card = document.createElement("ha-card");
    card.style.cssText = "padding:12px;display:block;";
    card.style.setProperty("--sl-bg", "var(--card-background-color, #fff)");
    card.style.setProperty("--sl-bg-input", "var(--input-fill-color, var(--card-background-color, #fafafa))");
    card.style.setProperty("--sl-text", "var(--primary-text-color, #333)");
    card.style.setProperty("--sl-text-sec", "var(--secondary-text-color, #666)");
    card.style.setProperty("--sl-text-muted", "var(--disabled-text-color, #999)");
    card.style.setProperty("--sl-border", "var(--divider-color, #e8e8e8)");
    card.style.setProperty("--sl-hover", "var(--primary-background-color, #e8f5e9)");
    card.style.setProperty("--sl-input-bg", "var(--input-fill-color, #f1f8e9)");
    card.style.setProperty("--sl-input-border", "var(--input-border-color, #c8e6c9)");
    card.style.setProperty("--sl-toast-bg", "var(--secondary-background-color, #333)");
    card.style.setProperty("--sl-toast-text", "var(--text-primary-color, #fff)");
    card.style.setProperty("--sl-danger", "var(--error-color, #ef5350)");
    card.style.setProperty("--sl-save", "var(--primary-color, #43A047)");
    card.style.setProperty("--sl-save-text", "var(--text-primary-color, #fff)");
    const style = document.createElement("style");
    style.textContent = `
      .sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;padding:12px;}
      @media (max-width:400px){.sl-grid{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;padding:8px;}}
      @media (max-width:320px){.sl-grid{grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;}}
    `;
    card.appendChild(style);

    if (this._legacyWarning) {
      const warn = document.createElement("div");
      warn.style.cssText = "padding:10px 12px;margin-bottom:12px;border-radius:10px;background:var(--error-color, #ef5350)22;border:1px solid var(--error-color, #ef5350);color:var(--error-color, #ef5350);font-size:13px;line-height:1.4;";
      warn.textContent = this._legacyWarning;
      card.appendChild(warn);
    }

    const sensorState = this._hass?.states?.[this._entity];
    if (!sensorState) {
      const missing = document.createElement("div");
      missing.style.cssText = "padding:16px;text-align:center;color:var(--sl-text-muted);font-size:14px;line-height:1.5;";
      missing.textContent = "Sensor „" + (this._entity || "?") + "“ nicht gefunden. Läuft das AppDaemon-Backend? Siehe README (Installation).";
      card.appendChild(missing);
      this.replaceChildren(card);
      this._pruneStaleModal();
      return;
    }

    const items = this._items;
    const color = this._color;

    card.appendChild(this._renderSearchBar());

    const groups = {};
    for (const item of items) {
      const cat = this._itemCategoryKey(item);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }

    const order = ["obst_gemuese","brot_backwaren","milch_eier","fleisch_fisch","trockenwaren","tiefkuehlprodukte","getraenke","haushalt_hygiene","sonstiges"].filter(k => groups[k]?.length > 0);
    for (const k of Object.keys(groups)) if (!order.includes(k)) order.push(k);

    const activeOrder = order.filter(k => groups[k].some(i => i.status === "needs_action"));

    for (const cat of activeOrder) {
      const catItems = groups[cat].filter(i => i.status === "needs_action");
      card.appendChild(this._renderCategory(cat, catItems));
    }

    const mirror = this._renderMirrorSection(items, order);
    if (mirror) card.appendChild(mirror);

    this.replaceChildren(card);
    this._pruneStaleModal();
  }

  _renderTile(item, catWrap) {
    const isDone = item.status === "completed";
    const color = this._color;
    const tile = document.createElement("div");
    tile.className = "sl-tile";
    tile.dataset.uid = item.uid;
    tile.dataset.summary = item.summary.toLowerCase();
    tile.dataset.status = item.status;
    tile.dataset.qty = String(item.quantity || 1);
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:" + (isDone ? "var(--sl-bg)" : color) + ";border:" + (isDone ? "2px solid var(--sl-border)" : "none") + ";opacity:" + (isDone ? "0.55" : "1") + ";cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;-webkit-touch-callout:none;-webkit-user-select:none;touch-action:manipulation;";
    tile.addEventListener("mouseenter", () => { if (tile.dataset.status !== "completed") tile.style.background = "var(--sl-save)"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = tile.dataset.status === "completed" ? "var(--sl-bg)" : color; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    this._renderItemIcon(iconWrap, item, 36);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.className = "sl-label";
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:" + (isDone ? "var(--sl-text-muted)" : "#fff") + ";max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = item.summary;
    tile.appendChild(label);

    if ((item.quantity || 1) > 1) {
      const badge = document.createElement("div");
      badge.className = "sl-badge";
      badge.style.cssText = "display:inline-block;padding:2px 6px;border-radius:8px;background:" + (isDone ? "var(--sl-border)" : "rgba(255,255,255,0.25)") + ";color:" + (isDone ? "var(--sl-text-muted)" : "#fff") + ";font-size:9px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;";
      badge.textContent = (item.quantity || 1) + "x";
      tile.appendChild(badge);
    }

    let pressTimer = null;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchHandled = false;
    let longPressFired = false;
    const fireLongPress = () => {
      if (longPressFired) return;
      longPressFired = true;
      this._haptic(80);
      const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
      if (currentItem) this._showEditModal(currentItem, tile);
    };
    const startPress = () => {
      longPressFired = false;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        fireLongPress();
      }, 500);
    };
    const LONG_PRESS_MOVE_THRESHOLD = 12;
    const endPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };
    tile.addEventListener("touchstart", e => {
      touchHandled = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      startPress();
    }, { passive: true });
    tile.addEventListener("touchend", () => {
      const wasTap = pressTimer && !longPressFired;
      endPress();
      if (wasTap) {
        const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
        if (currentItem) this._toggleItem(currentItem);
      }
      setTimeout(() => touchHandled = false, 300);
    });
    tile.addEventListener("touchcancel", () => { endPress(); setTimeout(() => touchHandled = false, 300); });
    tile.addEventListener("touchmove", e => {
      if (pressTimer) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) endPress();
      }
    }, { passive: true });
    tile.addEventListener("mousedown", e => {
      if (touchHandled) return;
      startPress();
    });
    tile.addEventListener("mouseup", () => { endPress(); });
    tile.addEventListener("mouseleave", () => { endPress(); });
    tile.addEventListener("contextmenu", e => {
      e.preventDefault();
      endPress();
      fireLongPress();
    });
    tile.addEventListener("click", () => {
      if (touchHandled || longPressFired) return;
      const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
      if (currentItem) this._toggleItem(currentItem);
    });
    if (catWrap) this._tileIndex.push({ tile, cat: catWrap, summary: item.summary.toLowerCase() });
    return tile;
  }

  _renderGhostTile(text, catWrap) {
    const color = this._color;
    const tile = document.createElement("div");
    tile.className = "sl-tile sl-ghost";
    tile.dataset.summary = text.toLowerCase();
    tile.dataset.status = "ghost";
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:var(--sl-bg);border:2px dashed var(--sl-border);opacity:0.65;cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;-webkit-touch-callout:none;-webkit-user-select:none;touch-action:manipulation;";
    tile.addEventListener("mouseenter", () => { tile.style.background = "var(--sl-hover)"; tile.style.borderColor = color; tile.style.opacity = "0.9"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = "var(--sl-bg)"; tile.style.borderColor = "var(--sl-border)"; tile.style.opacity = "0.65"; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    this._renderItemIcon(iconWrap, { summary: text, icon: null }, 36);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.className = "sl-label";
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:var(--sl-text-muted);max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = text;
    tile.appendChild(label);

    tile.addEventListener("click", () => this._addItem(text));
    if (catWrap) this._tileIndex.push({ tile, cat: catWrap, summary: text.toLowerCase() });
    return tile;
  }

  _showEditModal(item, triggerEl) {
    const existing = document.querySelector(".shopping-list-modal");
    existing && existing.remove();
    const close = () => { overlay.remove(); triggerEl && triggerEl.focus(); };
    const overlay = document.createElement("div");
    overlay.className = "shopping-list-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", item.summary + " bearbeiten");
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:900;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);";
    overlay.dataset.itemUid = item.uid;
    const box = document.createElement("div");
    box.style.cssText = "background:var(--card-background-color, var(--sl-bg, #fff));border-radius:16px;padding:20px;width:min(300px,92vw);max-width:92vw;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid var(--divider-color, var(--sl-border, #e8e8e8));box-sizing:border-box;color:var(--primary-text-color, var(--sl-text, #333));opacity:1 !important;";

    const title = document.createElement("div");
    title.className = "sl-modal-title";
    title.style.cssText = "font-size:17px;font-weight:600;margin-bottom:14px;color:var(--primary-color, #2e7d32);";
    title.textContent = item.summary;
    box.appendChild(title);

    const qtyLabel = document.createElement("div");
    qtyLabel.style.cssText = "font-size:13px;color:var(--secondary-text-color, #666);margin-bottom:8px;";
    qtyLabel.textContent = "Menge";
    box.appendChild(qtyLabel);

    const qtyRow = document.createElement("div");
    qtyRow.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:14px;";
    const qtyValue = document.createElement("div");
    qtyValue.className = "sl-modal-qty";
    qtyValue.style.cssText = "font-size:22px;font-weight:700;color:var(--primary-color, #2e7d32);min-width:40px;text-align:center;";
    qtyValue.textContent = String(item.quantity || 1);
    qtyRow.appendChild(qtyValue);

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.textContent = "−1";
    minusBtn.style.cssText = "padding:6px 12px;border-radius:16px;border:2px solid var(--error-color, #ef5350);background:transparent;color:var(--error-color, #ef5350);font-size:13px;font-weight:600;cursor:pointer;";
    minusBtn.addEventListener("click", () => {
      const cur = this._items.find(i => i.uid === item.uid);
      if (!cur) { close(); return; }
      this._updateQuantity(cur, -1);
      qtyValue.textContent = String(Math.max(0, (cur.quantity || 1) - 1));
    });
    qtyRow.appendChild(minusBtn);
    box.appendChild(qtyRow);

    const quickWrap = document.createElement("div");
    quickWrap.style.cssText = "display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;";
    for (const n of [1, 2, 5, 10]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "+" + n;
      btn.style.cssText = "padding:6px 12px;border-radius:16px;border:2px solid var(--input-border-color, #c8e6c9);background:var(--primary-background-color, #e8f5e9);color:var(--primary-color, #2e7d32);font-size:13px;font-weight:600;cursor:pointer;transition:all 0.1s;";
      btn.addEventListener("mouseenter", () => { btn.style.background = "var(--input-border-color, #c8e6c9)"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "var(--primary-background-color, #e8f5e9)"; });
      btn.addEventListener("click", () => {
        const cur = this._items.find(i => i.uid === item.uid);
        if (!cur) { close(); return; }
        this._updateQuantity(cur, n);
        qtyValue.textContent = String((cur.quantity || 1) + n);
      });
      quickWrap.appendChild(btn);
    }
    box.appendChild(quickWrap);

    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Schließen";
    closeBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:1px solid var(--input-border-color, #c8e6c9);background:transparent;color:var(--primary-text-color, #333);font-size:15px;cursor:pointer;";
    closeBtn.addEventListener("click", () => close());
    btns.appendChild(closeBtn);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Löschen";
    delBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:2px solid var(--error-color, #ef5350);background:transparent;color:var(--error-color, #ef5350);font-size:15px;font-weight:600;cursor:pointer;";
    delBtn.addEventListener("click", () => {
      const cur = this._items.find(i => i.uid === item.uid);
      if (cur) this._removeItem(cur);
      close();
    });
    btns.appendChild(delBtn);
    box.appendChild(btns);

    overlay.appendChild(box);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    overlay.addEventListener("keydown", e => {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {
        const focusable = box.querySelectorAll("button, [tabindex]:not([tabindex='-1'])");
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    document.body.appendChild(overlay);
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", required: true, selector: { text: {} } },
        { name: "entity", selector: { entity: { domain: "sensor" } } }
      ]
    };
  }

  static getStubConfig() {
    return { title: "Einkaufen", entity: "sensor.einkaufsliste_backend" };
  }

  getCardSize() { return 4; }
}

customElements.define("shopping-list-card", ShoppingListCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "shopping-list-card",
  name: "Shopping List",
  description: "Einkaufsliste mit AppDaemon-Backend (auto-Kategorisierung, auto-Dedup)",
  preview: true
});