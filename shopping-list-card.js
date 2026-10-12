// Shopping List Card v2.5.4 — AppDaemon backend edition (local SVG icons).
//
// Source of truth is not a native HA `todo.*` entity but the AppDaemon
// middleware backend that publishes `sensor.einkaufsliste_backend`. The card
// fires `einkaufsliste_*` HA events via the WebSocket `fire_event` command and
// reads the full list from the sensor's `items` attribute. Auto-categorization,
// auto-dedup and uid-stable removal all happen server-side; the card only
// renders and emits intents.
//
// Config:
//   type:     custom:shopping-list-card
//   entity:   sensor.einkaufsliste_backend   (required)
//   title:    "Einkaufen"
//   list:     "standard"
//   color:    "#43A047"
//   icon_map: {}                             per-article icon overrides
//   mirror:   true                           false = no "Verfügbar" backlog section
// Legacy `todo.*` entities and the removed `lists:` array are detected and
// render a migration warning instead of silently breaking.
//
// Architecture: surgical section-level DOM updates instead of full rebuilds,
// card-level event delegation (10 listeners per card, not per tile), tiles whose
// whole visual state lives in data attributes (no inline cssText, no JS hover),
// a parsed-SVG prototype cache (cloneNode instead of an innerHTML reparse),
// content-visibility for offscreen sections, a 150ms trailing debounce for full
// rebuilds, Cache Storage for the persistent SVG store (localStorage fallback),
// and inline MDI paths instead of <ha-icon> for static UI icons. The shared
// autocomplete/icon/category tables live at module scope.
//
// Version history lives in git and in the GitHub releases, not here.

// Inline MDI path data (from @mdi/svg 7.4.47) so the card doesn't spin up a
// <ha-icon> custom element (icon-set lookup + lit template) for each static
// UI icon. Only icons used by the card chrome are included; the view box and
// fill match what ha-icon would have rendered.
const MDI_PATHS = {
  "magnify": "M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z",
  "plus": "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
  "chevron-down": "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",
  "chevron-right": "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z",
  "archive-outline": "M20 21H4V10H6V19H18V10H20V21M3 3H21V9H3V3M9.5 11H14.5C14.78 11 15 11.22 15 11.5V13H9V11.5C9 11.22 9.22 11 9.5 11M5 5V7H19V5H5Z",
  "check-circle": "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",
  "cart-outline": "M17,18A2,2 0 0,1 19,20A2,2 0 0,1 17,22C15.89,22 15,21.1 15,20C15,18.89 15.89,18 17,18M1,2H4.27L5.21,4H20A1,1 0 0,1 21,5C21,5.17 20.95,5.34 20.88,5.5L17.3,11.97C16.96,12.58 16.3,13 15.55,13H8.1L7.2,14.63L7.17,14.75A0.25,0.25 0 0,0 7.42,15H19V17H7C5.89,17 5,16.1 5,15C5,14.65 5.09,14.32 5.24,14.04L6.6,11.59L3,4H1V2M7,18A2,2 0 0,1 9,20A2,2 0 0,1 7,22C5.89,22 5,21.1 5,20C5,18.89 5.89,18 7,18M16,11L18.78,6H6.14L8.5,11H16Z"
};

// Render one of the MDI_PATHS icons as a standalone inline <svg> string.
// Returns null for unknown names so callers can fall back to <ha-icon>.
function mdiSvgString(name, size) {
  const d = MDI_PATHS[name];
  if (!d) return null;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + size +
    '" height="' + size + '" style="fill:currentColor;display:block;"><path d="' + d + '"/></svg>';
}

// ---------------------------------------------------------------------------
// Shared data tables. Pure, instance-independent literals, hoisted to module
// scope so they are built once instead of per card instance.
// ---------------------------------------------------------------------------
const AUTOCOMPLETE_ITEMS = [...new Set([
  "Apfel","Bananen","Birne","Kiwi","Orange","Weintrauben","Kirschen","Erdbeeren","Himbeeren",
  "Pfirsich","Pflaume","Zitrone","Melone","Ananas","Mango","Avocado","Tomaten","Gurke","Paprika",
  "Karotten","Zucchini","Aubergine","Brokkoli","Blumenkohl","Spinat","Salat","Kartoffeln","Zwiebeln","Knoblauch",
  "Pilze","Champignons","Radieschen","Brot","Brötchen","Toast","Baguette","Kräuterbaguettes","Croissants","Milch",
  "Joghurt","Sahne","Butter","Käse","Schafskäse","Ofenkäse","Quark","Frischkäse","Mozzarella","Eier",
  "Hähnchen","Hackfleisch","Schnitzel","Schinken","Aufschnitt","Rindersteak","Putensteak","Schweinesteak","Fisch","Lachs","Garnelen","Tofu",
  "Bratwürstchen","Nudeln","Spaghetti","Reis","Mehl","Zucker","Salz","Pfeffer","Olivenöl","Essig",
  "Ketchup","Mayonnaise","Senf","Honig","Marmelade","Tiefkühlpizza","Fischstäbchen","Pommes","Eis","Wasser",
  "Saft","Cola","Bier","Weißwein","Rotwein","Kaffee","Tee","Toilettenpapier","Küchenrolle","Shampoo",
  "Duschgel","Seife","Zahnpasta","Waschmittel","Weichspüler","Spülmittel","Schokolade","Kekse","Chips","Nüsse",
  "Mandeln","TK-Gemüse","Müllbeutel","Aprikose","Brombeeren","Clementine","Cranberry","Datteln","Feige","Granatapfel",
  "Heidelbeeren","Johannisbeeren","Nektarine","Pampelmuse","Preiselbeeren","Blattspinat","Chinakohl","Eisbergsalat","Feldsalat","Dill",
  "Kürbis","Lauch","Mais","Mangold","Pak Choi","Pastinake","Peperoni","Petersilie","Buttermilch","Griechischer Joghurt",
  "Kefir","Ricotta","Hähnchenbrust","Hähnchenkeule","Lamm","Linsen","Sekt","Gemüsepfanne","Kuchen","Ravioli",
  "Tortellini","Waffeln","Wraps","Abwaschbürste","Alufolie","Deo","Frischhaltefolie","Küchentücher","Lebkuchen","Kaviar",
  "Biobeutel"
])];
const ICON_MAP = {
  eier:"1F95A", ei:"1F95A", apfel:"1F34E", äpfel:"1F34E", banane:"1F34C", bananen:"1F34C",
  birne:"1F350", birnen:"1F350", kiwi:"1F95D", orange:"1F34A", orangen:"1F34A",
  traube:"1F347", trauben:"1F347", weintrauben:"1F347", kirsche:"1F352", kirschen:"1F352",
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
  cheddar:"1F9C0", fleisch:"1F969", hähnchen:"1F357", pute:"1F357",
  ente:"1F357", schinken:"1F953", speck:"1F953", wurst:"bratwurst.svg", bratwürstchen:"bratwurst.svg", salami:"1F32D",
  mettwurst:"1F32D", aufschnitt:"1F953", steak:"steak.svg", steaks:"steak.svg", rindersteak:"steak.svg", rindersteaks:"steak.svg", beefsteak:"steak.svg",
  putensteak:"putensteak.svg", putensteaks:"putensteak.svg", schweinesteak:"schweinesteak.svg", schweinesteaks:"schweinesteak.svg", schweinskotelett:"schweinesteak.svg",
  schnitzel:"1F969", hackfleisch:"1F356", fisch:"1F41F", lachs:"1F41F",
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
  toilettenpapier:"1F9FB", küchenrolle:"papierhandtuch.svg", kuechenrolle:"papierhandtuch.svg", papier:"1F4C4", taschentuch:"1F9FB",
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
const CAT_MAP = [
  { key: "obst_gemuese", keys: new Set(["apfel","äpfel","banane","bananen","birne","birnen","kiwi","orange","orangen","traube","trauben","weintrauben","kirsche","kirschen","erdbeere","erdbeeren","himbeere","himbeeren","heidelbeere","heidelbeeren","pfirsich","pflaume","zitrone","limette","grapefruit","melone","ananas","mango","obst","frucht","tomate","tomaten","gurke","paprika","karotte","karotten","zucchini","aubergine","brokkoli","blumenkohl","spinat","blattspinat","salat","kartoffel","kartoffeln","zwiebel","zwiebeln","knoblauch","lauch","schnittlauch","dill","frühlingszwiebel","schalotte","radieschen","sellerie","rote bete","rotebete","pilz","champignon","pfifferling","steinpilz","kräuterseitling","austernpilz","pilze","gemüse","avocado","aprikose","brombeeren","clementine","klementine","cranberry","datteln","feige","granatapfel","johannisbeeren","nektarine","pampelmuse","preiselbeeren","stachelbeeren","wassermelone","chinakohl","eisbergsalat","feldsalat","kürbis","mais","mangold","pak choi","pastinake","petersilie","porree","rettich","rosenkohl","rotkohl","rucola","spargel","süßkartoffel","topinambur","weißkohl","holunder","orangenschalen","salbei","zitronenmelisse","trockenobst"]) },
  { key: "brot_backwaren", keys: new Set(["brot","brötchen","toast","semmel","baguette","kräuterbaguette","kräuterbaguettes","ciabatta","croissant","schrippe","weckle","laugenbrezel","brezel","aufbackbrötchen","blätterteig","kuchen","wraps"]) },
  { key: "milch_eier", keys: new Set(["milch","joghurt","sahne","schmand","schlagsahne","butter","käse","quark","frischkäse","mozzarella","brie","gouda","emmentaler","parmesan","cream cheese","mascarpone","eier","burrata","cheddar","buttermilch","camembert","creme fraiche","feta","griechischer joghurt","kefir","kochkäse","leerdammer","milchreis","ricotta","schafskäse","ofenkäse"]) },
  { key: "fleisch_fisch", keys: new Set(["fleisch","steak","steaks","rindersteak","rindersteaks","beefsteak","putensteak","putensteaks","schweinesteak","schweinesteaks","schweinskotelett","hähnchen","pute","ente","schinken","speck","wurst","bratwürstchen","aufschnitt","schnitzel","hackfleisch","salami","mettwurst","fisch","lachs","thunfisch","forelle","garnelen","krabben","scholle","makrele","tofu","seitan","vegan","vegetarisch","calamari","hähnchenbrust","hähnchenkeule","kalbfleisch","kassler","lamm","leber","lunge","putenbrust","putenschnitzel","rinderfilet","rinderhack","rinderroulade","rollmops","sülze","zander"]) },
  { key: "trockenwaren", keys: new Set(["nudeln","spaghetti","penne","rigatoni","fettuccine","lasagne","reis","couscous","bulgur","mehl","zucker","salz","pfeffer","olivenöl","sonnenblumenöl","speiseöl","essig","soße","ketchup","mayo","mayonnaise","senf","gewürz","gewürze","kräuter","vanille","zimt","honig","marmelade","nutella","aufstrich","kapern","oliven","essiggurke","sauerkraut","peperoni","antipasti","backpulver","balsamico","brühe","gnocchi","haferflocken","kartoffelstärke","kichererbsen","kidneybohnen","linsen","paniermehl","pesto","polenta","rosinen","sahnesteif","sojasoße","soßenbinder","vanillezucker","worcestersauce","schokolade","keks","chips","nüsse","mandeln","bonbons","bubblegum","gummibärchen","kaugummi","knuspermüsli","lebkuchen","lutscher","marshmallow","nougat","pralinen","salzstangen","studentenfutter","pfefferkörner"]) },
  { key: "tiefkuehlprodukte", keys: new Set(["tiefkühl","tiefkühlpizza","pizza","frikassee","fischstäbchen","pommes","eis","eiskrem","gemüsepfanne","knödel","nuggets","paniertes","piroggen","ravioli","reibekuchen","schaschlik","tortellini","tk-gemüse","waffeln"]) },
  { key: "getraenke", keys: new Set(["wasser","getränke","cola","saft","bier","wein","weißwein","rotwein","limonade","sprite","fanta","apfelschorle","kaffee","espresso","kapseln","kakao","tee","cappuccino","energydrink","granatapfelsaft","hugo","mineralwasser","prosecco","radler","sekt","smoothie","sprudelwasser","traubensaft"]) },
  { key: "haushalt_hygiene", keys: new Set(["toilettenpapier","küchenrolle","papier","taschentuch","shampoo","duschgel","seife","zahnpasta","zahnbürste","deodorant","rasierer","dusch","bad","waschmittel","weichspüler","reiniger","spülmittel","tabs","spüli","abwaschbürste","alufolie","backpapier","deo","desinfektionsmittel","drano","feuchttücher","frischhaltefolie","geschirrtabs","glühbirne","haargel","handcreme","handschuhe","hustensaft","insektenspray","kerze","kerzen","klorollen","kondome","körperöl","küchentücher","leinöl","lotion","lufterfrischer","make-up","mascara","medikamente","milchreiniger","mülltüten","müllbeutel","mundspülung","nasenspray","papiertüten","parfüm","pflaster","rasierklingen","rasierschaum","räucherstäbchen","spülbürste","staubsaugerbeutel","streichhölzer","taschentücher","teebaumöl","toilettenreiniger","zündhölzer"]) }
];
const CATEGORY_NAME_TO_KEY = {
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
// Animated inline SVG category icons. Embedded directly (not as <img> or
// <ha-icon>) so the CSS animations actually run. Replace an individual SVG by
// editing its string; the key names must stay stable.
const CATEGORY_SVGS = {
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
    this._renderPending = false;
    this._renderRaf = null;
    this._entity = null;
    this._listId = "standard";
    this._color = "#43A047";
    this._legacyWarning = null;
    this._itemIconMapping = {};
    this._categoryIconCache = {};
    // Performance caches: these are rebuilt per card instance, so a page
    // refresh clears them. That keeps newly-added /local/ SVGs and mapping.json
    // changes discoverable while avoiding repeated work during renders.
    this._translitCache = new Map();
    this._categoryCache = new Map();
    this._svgTextCache = new Map();
    this._svgInFlight = new Map();
    this._autocompleteCatCache = new Map();
    // v2.4.0: parsed SVG prototype cache. Each URL is parsed into a detached
    // <svg> element exactly once; applications clone the prototype instead of
    // re-running innerHTML (HTML parser + DOM build) for every tile. This is
    // the biggest single win for full rebuilds (~150 tiles × ~1 SVG parse).
    this._svgDomCache = new Map();
    // v2.4.0: trailing debounce for full rebuilds. Surgical updates apply
    // immediately; a full rebuild coalesces burst-triggered rebuilds within
    // a 150ms window (both WS subscriptions + hass updates often fire back to
    // back after one backend change).
    this._fullRenderTimer = null;
    // v2.4.0: current search query (lowercased). Tracked on the instance so
    // a rebuild can restore input text + tile filtering, and so surgical
    // updates can bail to a full render while a filter is active.
    this._searchQuery = "";
    this._searchText = "";       // original-case input text (restored after rebuilds)
    // v2.4.0: card-level event delegation state (see _bindCardEvents).
    this._press = null;          // { tile, timer, x, y } — active long-press
    this._touchTile = null;      // last touch-handled tile (suppress duplicate mouse/click)
    this._touchAt = 0;           // timestamp of that touch
    this._longPressTile = null;  // tile whose long-press just fired (suppress click)
    this._longPressAt = 0;
    // v2.4.0: Cache Storage API handle (memoized promise) for the persistent
    // SVG store; null on non-secure contexts (plain http LAN) where the API
    // is unavailable — the localStorage path remains as fallback.
    this._cacheStorePromise = null;
    // Per-instance negative cache for the animated category SVG probe in
    // _renderCategoryIcon. Animated variants under categories/animated/ almost
    // never exist, so every category header would otherwise pay a 404 round-trip
    // on every full render before falling back to the static SVG. Once a key's
    // animated URL has 404'd (or returned unparseable content) we skip the probe
    // for that key on subsequent renders. The set is persisted in localStorage
    // (see _loadNoAnimatedSvg) so a 404 learned in one session is remembered
    // across reloads, and config `probe_animated: false` disables the probe
    // entirely. Scoped to the animated probe only — item-icon fetches stay
    // uncached-on-404 so newly uploaded /items/*.svg files show up without a
    // forced refresh.
    this._noAnimatedSvg = new Set();

    // Persistent icon cache (survives page reloads / app restarts). Stores
    // ONLY successful (HTTP 200) SVG texts keyed by URL in localStorage, so
    // repeated page loads don't re-fetch ~120 icons over the network — the
    // main cause of slow icon loading on mobile. 404s are deliberately NOT
    // stored, so newly uploaded /items/*.svg files are still discovered: the
    // no-store rationale in _loadSvgInline only applied to the *browser HTTP*
    // cache; a JS-side cache that stores only 200s sidesteps it. Falls back
    // gracefully to the per-instance RAM cache when localStorage is
    // unavailable (private mode, quota exceeded, non-secure context).
    // Whole-blob TTL (7 days): if the cache is older it is rebuilt from the
    // network once, picking up replaced SVG files without a manual version
    // bump. Bump _PCACHE_VERSION when the icon set changes wholesale.
    this._pCacheVersion = 1;
    this._pCacheTtlMs = 7 * 24 * 3600 * 1000;
    this._persistentSvg = null;     // Map<url, text>, lazy-loaded
    this._persistTimer = null;
    this._loadNoAnimatedSvg();

    // Short-TTL negative cache for item-icon 404s. When an /items/*.svg URL
    // 404s, remember it for _negCacheTtlMs so subsequent renders skip the
    // network round-trip and go straight to the category/final fallback.
    // Per-instance (RAM) only — a page refresh clears it, so newly uploaded
    // /items/*.svg files are discovered at most _negCacheTtlMs later. Scoped
    // to the item-icon path (the animated category probe keeps its own
    // _noAnimatedSvg set). 5 min trades a little new-icon latency for
    // eliminating the repeated 404 chain on every full rebuild.
    this._itemIconMissing = new Map(); // url -> expiry timestamp
    this._negCacheTtlMs = 5 * 60 * 1000;

    // Lazy ghost-tile icon loading. Offscreen backlog tiles defer their SVG
    // fetch+parse until they scroll near the viewport (IntersectionObserver),
    // so a full backlog render (~116 tiles) doesn't fire ~116 synchronous
    // SVG loads in one frame. First-screen tiles load immediately (checked
    // via getBoundingClientRect) to avoid a one-frame observer delay.
    this._lazyIconIO = null;
    this._lazyIconCallbacks = null; // WeakMap<container, run>

    // Background warmup of the persistent SVG cache. After the first render,
    // pre-fetch any catalog SVGs not yet cached into localStorage in idle
    // time, so the NEXT render (and offscreen tiles as they scroll in) hit
    // only the cache. Idempotent: only fetches URLs not already cached.
    this._warmupScheduled = false;
    this._warmupIdleHandle = null;   // requestIdleCallback/setTimeout handle for _scheduleWarmup
    this._warmupStepHandle = null;   // handle for the staggered _warmupSvgCache step loop
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error('Du musst "entity" (sensor.einkaufsliste_backend) konfigurieren.');
    }
    this._entity = config.entity;
    this._listId = config.list || "standard";
    this._color = config.color || "#43A047";
    // Opt-out for the "Verfügbar" backlog mirror — the catalog section rendered
    // under the list. When off it is never built and never kept compatible, which
    // matters on weak clients (the kiosk tablet) where the mirror adds ~116 tiles.
    this._mirrorEnabled = config.mirror !== false;

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
    this._loadItemIconMapping();
    if (this._hass) this._fetchAndRender();
  }

  _initCaches() {
    if (this._cachesReady) return;
    this._autocompleteItems = AUTOCOMPLETE_ITEMS;

    this._iconMap = ICON_MAP;
    this._iconMapEntries = Object.entries(this._iconMap).sort((a, b) => b[0].length - a[0].length);

    this._catMap = CAT_MAP;
    this._catLookup = new Map();
    for (const cat of this._catMap) {
      for (const key of cat.keys) {
        this._catLookup.set(key, cat.key);
      }
    }
    this._catLookupEntries = [...this._catLookup.entries()].sort((a, b) => b[0].length - a[0].length);

    // Stem-based category index for the fuzzy pass 2 in _getItemCategory.
    // Catches compounds that drop an inflection letter ("Erdbeerjoghurt" ->
    // stem "erdbeer", since the keyword is "erdbeere") and ASCII-typed umlaut
    // words ("Kaese" -> transliterated "kaese" matches stem "kaes" from
    // "kaese"). Anchors cover generic stems that are NOT standalone keywords
    // (kohl -> Grünkohl, beer -> Walbeere, suppe -> Hühnersuppe). Anchors are
    // inserted first and win on collision.
    const anchorStems = [
      ["kohl", "obst_gemuese"],
      ["beer", "obst_gemuese"],
      ["suppe", "trockenwaren"]
    ];
    const stemMap = new Map();
    for (const [stem, catKey] of anchorStems) stemMap.set(stem, catKey);
    for (const [key, catKey] of this._catLookupEntries) {
      const stem = this._stem(key);
      // keep stems of length >= 4; the length guard inside _stem already
      // prevented over-short results, but double-check to be safe.
      if (stem && stem.length >= 4 && !stemMap.has(stem)) stemMap.set(stem, catKey);
    }
    this._stemCatEntries = [...stemMap.entries()].sort((a, b) => b[0].length - a[0].length);

    // Reverse map: backend publishes category NAME (e.g. "Obst & Gemüse"),
    // but grouping/icon/color need the canonical key. Fall back to summary scan.
    this._categoryNameToKey = CATEGORY_NAME_TO_KEY;
    this._categorySvgs = CATEGORY_SVGS;

    // Mirror section calls _getItemCategory for every autocomplete article on
    // every full render. Pre-compute the categories once here after the lookup
    // tables are built.
    this._autocompleteCatCache = new Map();
    for (const text of this._autocompleteItems) {
      this._autocompleteCatCache.set(text, this._getItemCategory(text));
    }

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
    // Coalesce multiple triggers into one parse+render pass per animation frame.
    // Both subscribe_entities and state_changed fire for the same backend
    // change; without this, each separately runs _loadItems (re-parse of the
    // items attribute + fingerprint hash over all items). requestAnimationFrame
    // collapses all triggers that land within the same frame into a single
    // pass and aligns the DOM update with the browser paint. It also naturally
    // skips work while the tab is hidden; the next visible frame renders with
    // the latest this._hass.
    //
    // v2.4.0: after the fingerprint check, try a surgical update first (only
    // the categories whose items actually changed are rebuilt in place). Full
    // rebuilds — needed when the DOM doesn't match the previous fingerprint —
    // go through a short trailing debounce (_scheduleFullRender) so a burst of
    // triggers coalesces into one rebuild instead of several.
    if (this._renderPending) return;
    this._renderPending = true;
    this._renderRaf = requestAnimationFrame(() => {
      this._renderPending = false;
      this._renderRaf = null;
      this._loadItems();
      if (this._fingerprint === this._lastFingerprint) return;
      if (this._applySurgicalUpdate()) {
        this._lastFingerprint = this._fingerprint;
        // A pending full rebuild is now obsolete — the surgical pass already
        // synced the DOM to the latest fingerprint.
        if (this._fullRenderTimer) {
          clearTimeout(this._fullRenderTimer);
          this._fullRenderTimer = null;
        }
        return;
      }
      this._scheduleFullRender();
    });
  }

  // Trailing-debounced full rebuild. The first paint (no card yet) is
  // immediate; afterwards a burst of full-rebuild triggers within the window
  // collapses into a single rebuild that sees the newest this._hass.
  _scheduleFullRender() {
    if (!this.querySelector("ha-card")) { this._render(); return; }
    if (this._fullRenderTimer) clearTimeout(this._fullRenderTimer);
    this._fullRenderTimer = setTimeout(() => {
      this._fullRenderTimer = null;
      this._render();
    }, 150);
  }

  _loadItems() {
    const st = this._hass?.states?.[this._entity];
    // Stash the previous items BEFORE replacing, so _applySurgicalUpdate can
    // diff prev→current and be certain the DOM still reflects _prevItems.
    this._prevItems = this._items;
    if (!st) { this._items = []; this._fingerprint = 0; return; }
    const all = Array.isArray(st.attributes?.items) ? st.attributes.items : [];
    this._items = all.filter(i => (i.list || "standard") === this._listId);
    this._fingerprint = this._fingerprintOf(this._items);
  }

  _fingerprintOf(items) {
    let fp = 0;
    for (const i of items) {
      fp = (fp * 31 + this._hashString(i.uid + "|" + i.status + "|" + i.summary + "|" + (i.quantity || 1) + "|" + (i.icon || ""))) >>> 0;
    }
    return fp;
  }

  _hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
  }

  _getLocalIconBaseUrl() {
    return this.config?.icon_base_url || "/local/shopping-list-card";
  }

  _loadItemIconMapping() {
    if (this._itemIconMappingLoading) return;
    this._itemIconMappingLoading = true;
    const url = `${this._getLocalIconBaseUrl()}/items/mapping.json`;
    fetch(url, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data === "object") {
          this._itemIconMapping = data;
          if (this._hass) this._fetchAndRender();
          // mapping.json may refine item filenames → re-warmup the cache with
          // the now-correct URLs (idempotent: only fetches uncached URLs).
          this._warmupScheduled = false;
          this._scheduleWarmup();
        }
      })
      .catch(() => { /* mapping.json is optional */ });
  }

  _resolveItemIconFile(item) {
    const summary = item?.summary || "";
    const lower = String(summary).toLowerCase();
    // 1. explicit config override
    const cfg = this.config?.icon_map || {};
    if (cfg[summary] || cfg[lower]) return cfg[summary] || cfg[lower];
    // 2. backend icon field (treat as filename if it looks like one)
    const backendIcon = item?.icon;
    if (backendIcon && /\.(svg|png|jpg|jpeg)$/i.test(String(backendIcon))) return String(backendIcon);
    // 3. mapping.json
    if (this._itemIconMapping[summary]) return this._itemIconMapping[summary];
    if (this._itemIconMapping[lower]) return this._itemIconMapping[lower];
    // 4. built-in icon map for local SVG filenames (overrides the automatic guess)
    for (const [key, val] of this._iconMapEntries) {
      if (lower.includes(key) && /\.(svg|png|jpg|jpeg)$/i.test(String(val))) return String(val);
    }
    // 5. exact filename guess from summary (e.g. "Erdbeeren" -> "erdbeeren.svg")
    const guessed = lower.replace(/\s+/g, "_").replace(/[ä]/g, "ae").replace(/[ö]/g, "oe").replace(/[ü]/g, "ue").replace(/[ß]/g, "ss").replace(/[^a-z0-9_]/g, "") + ".svg";
    return guessed;
  }

  // Parse an SVG text string into a detached, style-normalized <svg> prototype.
  // The prototype is cached per URL in _svgDomCache; applications clone it via
  // cloneNode(true), which is dramatically cheaper than re-running innerHTML
  // (HTML parser + full DOM build) for every tile on every render.
  _parseSvgElement(text) {
    if (!text) return null;
    // Flaticon SVGs often start with <?xml + generator comments; strip
    // everything before the first <svg so innerHTML parses cleanly.
    const idx = text.toLowerCase().indexOf("<svg");
    if (idx < 0) return null;
    const tmp = document.createElement("div");
    tmp.innerHTML = text.slice(idx);
    const svg = tmp.querySelector("svg");
    if (!svg) return null;
    // Force a uniform rendered size regardless of the SVG's own width/height
    // attributes or internal styles. The wrapper guarantees the footprint,
    // the SVG fills it with preserved aspect ratio.
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.display = "block";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.style.flexShrink = "0";
    return svg;
  }

  // Clone a (possibly null) prototype into a sized wrapper inside container.
  // Returns true when a prototype was applied.
  _applySvgTo(container, proto, size, options) {
    if (!proto) return false;
    const finalSize = (size && size > 0) ? size : 24;
    const wrap = document.createElement("div");
    wrap.style.cssText = `display:flex;align-items:center;justify-content:center;width:${finalSize}px;height:${finalSize}px;flex-shrink:0;${options || ""}`;
    wrap.appendChild(proto.cloneNode(true));
    container.innerHTML = "";
    container.appendChild(wrap);
    return true;
  }

  // Parsed-prototype lookup with lazy promotion from the text caches.
  // Order: DOM cache → RAM text cache → persistent store (Cache API or
  // localStorage fallback). Returns the prototype or null when the text
  // isn't cached yet (the caller then goes through _prefetchSvg).
  _getSvgProto(url) {
    let proto = this._svgDomCache.get(url);
    if (proto) return proto;
    const cached = this._svgTextCache.get(url);
    let text = cached && cached.ok ? cached.text : null;
    if (!text) text = this._getPersistentCache().get(url) || null;
    if (!text) return null;
    proto = this._parseSvgElement(text);
    if (proto) this._svgDomCache.set(url, proto);
    return proto || null;
  }

  // --- Persistent icon cache (localStorage) -----------------------------
  // Survives page reloads / app restarts so icons appear instantly on mobile.
  // Stores ONLY HTTP 200 SVG texts (never 404s → new icons still discovered).
  // 7-day whole-blob TTL; falls back to RAM-only if localStorage is blocked.

  _loadNoAnimatedSvg() {
    // Restore the per-key "no animated variant" set from localStorage so 404s
    // learned in a previous session are not re-probed on every full render.
    try {
      const raw = localStorage.getItem("slc_no_animated_v1");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) for (const k of arr) this._noAnimatedSvg.add(k);
      }
    } catch (e) { /* private mode / quota — degrade to RAM-only */ }
  }

  _markNoAnimatedSvg(key) {
    if (this._noAnimatedSvg.has(key)) return;
    this._noAnimatedSvg.add(key);
    try {
      localStorage.setItem("slc_no_animated_v1", JSON.stringify([...this._noAnimatedSvg]));
    } catch (e) { /* ignore — RAM set still works for this session */ }
  }

  _getPersistentCache() {
    if (this._persistentSvg !== null) return this._persistentSvg;
    const map = new Map();
    try {
      const raw = localStorage.getItem(`slc_svg_cache_v${this._pCacheVersion}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.entries && typeof parsed.entries === "object") {
          const age = (Date.now() || 0) - (parsed.ts || 0);
          if (age <= this._pCacheTtlMs) {
            for (const [url, text] of Object.entries(parsed.entries)) {
              if (typeof text === "string") map.set(url, text);
            }
          }
        }
      }
    } catch (e) { /* corrupt JSON / unavailable — start empty */ }
    this._persistentSvg = map;
    return map;
  }

  _persistSvgCacheSoon() {
    // Coalesce writes: many icons arrive in a burst during a full render; we
    // debounce to a single localStorage write 1s after the last addition.
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => {
      this._persistTimer = null;
      const map = this._persistentSvg;
      if (!map) return;
      try {
        const entries = {};
        let n = 0;
        for (const [url, text] of map) {
          entries[url] = text;
          if (++n >= 3000) break; // guard against unbounded growth / quota
        }
        localStorage.setItem(
          `slc_svg_cache_v${this._pCacheVersion}`,
          JSON.stringify({ ts: Date.now() || 0, entries })
        );
      } catch (e) { /* quota exceeded — keep RAM cache, skip persisting */ }
    }, 1000);
  }

  // Network stage shared by _loadSvgInline (render) and _warmupSvgCache
  // (background pre-fetch). Handles: RAM cache hit, persistent cache hit,
  // short-TTL negative cache (skip recently-404'd URLs), in-flight dedup,
  // and storing HTTP 200 texts into both RAM and persistent caches. Does
  // NOT touch the DOM — the caller applies the result (or ignores it for
  // warmup). Returns a Promise that resolves with no value once the URL's
  // status is settled (check _svgTextCache afterwards).
  // --- Cache Storage API persistent store --------------------------------
  // v2.4.0: prefer the Cache Storage API over the localStorage blob. The
  // localStorage path serializes ~120 SVG texts into one JSON string on the
  // main thread (multi-MB stringify per persist, blocking) and parses the
  // whole blob back on load. caches.put stores each URL natively, off the
  // main thread, with per-entry retrieval. The API requires a secure context
  // — plain-http LAN HA installs have no `window.caches` — so this feature-
  // detects and returns null there, keeping localStorage as the fallback.

  _getCacheStore() {
    if (this._cacheStorePromise !== null) return this._cacheStorePromise;
    this._cacheStorePromise = (async () => {
      if (typeof caches === "undefined") return null;
      const name = `slc-svg-v${this._pCacheVersion}`;
      try {
        let store = await caches.open(name);
        const tsResp = await store.match("__slc_ts__");
        let ts = 0;
        if (tsResp) ts = Number(await tsResp.text()) || 0;
        if (!ts || (Date.now() - ts) > this._pCacheTtlMs) {
          // Blob expired (or fresh install): drop the whole cache and start
          // over with a fresh timestamp. Mirrors the localStorage blob TTL.
          await caches.delete(name);
          store = await caches.open(name);
          await store.put("__slc_ts__", new Response(String(Date.now())));
        }
        return store;
      } catch (e) { /* storage blocked — fall back to localStorage */ return null; }
    })();
    return this._cacheStorePromise;
  }

  _cacheLookup(url) {
    return this._getCacheStore().then(store => {
      if (!store) return null;
      return store.match(url).then(r => (r && r.ok) ? r.text() : null);
    }).catch(() => null);
  }

  // Fetch a URL on the wire; negative-caches item-icon 404s on failure.
  _fetchSvg(url) {
    return fetch(url, { cache: "no-store" })
      .then(r => {
        if (!r.ok) {
          // Scope the negative cache to per-article item icons only — never
          // cache a missing category SVG or the sonstiges.svg final fallback,
          // so a transiently-missing fallback still retries on each render.
          if (/\/items\//.test(url) && !/\/sonstiges\.svg$/.test(url)) {
            this._itemIconMissing.set(url, Date.now() + this._negCacheTtlMs);
          }
          return null;
        }
        return r.text();
      });
  }

  // Persist a successful SVG text: Cache API when available, else the
  // debounced localStorage blob.
  _storePersisted(url, text) {
    this._getCacheStore().then(store => {
      if (store) {
        store.put(url, new Response(text, { headers: { "Content-Type": "image/svg+xml" } }));
        return;
      }
      const pc = this._getPersistentCache();
      if (!pc.has(url)) {
        pc.set(url, text);
        this._persistSvgCacheSoon();
      }
    }).catch(() => { /* keep RAM copy regardless */ });
  }

  _prefetchSvg(url) {
    if (this._svgDomCache.has(url) || this._svgTextCache.has(url)) return Promise.resolve();
    const pc = this._getPersistentCache();
    if (pc.has(url)) return Promise.resolve();
    // Short-TTL negative cache: skip re-fetching URLs that recently 404'd,
    // so repeated renders don't replay the 404→fallback chain for unknown
    // item SVGs. Cleared on reload, so new uploads are discovered at most
    // _negCacheTtlMs later.
    const miss = this._itemIconMissing.get(url);
    if (miss && Date.now() < miss) return Promise.resolve();
    let flight = this._svgInFlight.get(url);
    if (flight) return flight.then(() => {});
    flight = this._cacheLookup(url)
      .then(text => text || this._fetchSvg(url))
      .then(text => {
        this._svgInFlight.delete(url);
        if (text) {
          this._svgTextCache.set(url, { ok: true, text });
          this._storePersisted(url, text);
        }
        return text;
      })
      .catch(() => {
        this._svgInFlight.delete(url);
        return null;
      });
    this._svgInFlight.set(url, flight);
    return flight.then(() => {});
  }

  _loadSvgInline(url, container, size, options) {
    // Layer 1: parsed-prototype cache (DOM cache → RAM text cache →
    // persistent store). A hit is a synchronous cloneNode + append — no
    // fetch, no innerHTML parse.
    let proto = this._getSvgProto(url);
    if (proto) return Promise.resolve(this._applySvgTo(container, proto, size, options));
    // Layer 2: network (deduped + negative-cached) via _prefetchSvg, then
    // apply. On failure the caller's fallback chain takes over.
    return this._prefetchSvg(url).then(() => {
      const p = this._getSvgProto(url);
      return this._applySvgTo(container, p, size, options);
    });
  }

  // --- Lazy ghost-tile icon loading (IntersectionObserver) ---------------
  // Offscreen backlog tiles defer their SVG fetch+parse until they scroll
  // near the viewport, so a full backlog render (~116 tiles) doesn't fire
  // ~116 synchronous SVG loads in one frame. Tiles already in the viewport
  // are reported by the observer on its first callback (~1 frame).

  _observeForLazy(container, run) {
    if (!this._lazyIconIO) {
      this._lazyIconIO = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const fn = this._lazyIconCallbacks && this._lazyIconCallbacks.get(e.target);
            if (fn) {
              this._lazyIconCallbacks.delete(e.target);
              fn();
            }
            this._lazyIconIO.unobserve(e.target);
          }
        }
      }, { rootMargin: "300px" });
      this._lazyIconCallbacks = new WeakMap();
    }
    this._lazyIconCallbacks.set(container, run);
    this._lazyIconIO.observe(container);
  }

  // --- Background warmup of the persistent SVG cache ---------------------
  // After the first render, pre-fetch any catalog/category SVGs not yet
  // cached into localStorage in idle time, so the next render and scrolling
  // offscreen tiles hit only the cache. Idempotent: only fetches uncached
  // URLs. Runs in idle callbacks with small batches to avoid competing with
  // the live render for the browser's connection budget.

  _scheduleWarmup() {
    if (this._warmupScheduled) return;
    this._warmupScheduled = true;
    const run = () => {
      this._warmupIdleHandle = null;
      this._warmupScheduled = false;
      this._warmupSvgCache();
    };
    this._warmupIdleHandle = typeof requestIdleCallback === "function"
      ? requestIdleCallback(run, { timeout: 4000 })
      : setTimeout(run, 1500);
  }

  // Cancel any pending warmup idle/timeout handle. Safe regardless of which
  // scheduler produced it: the wrong clearer is a no-op on a foreign handle.
  _clearWarmupHandle(h) {
    if (h == null) return;
    if (typeof cancelIdleCallback === "function") cancelIdleCallback(h);
    clearTimeout(h);
  }

  _warmupSvgCache() {
    if (!this._cachesReady) return;
    const base = this._getLocalIconBaseUrl();
    const urls = new Set();
    // Item icons for every catalog article. Only warm once mapping.json is
    // loaded — before that, _resolveItemIconFile falls back to transliteration
    // guesses that 404 for most articles, which would turn the warmup into a
    // 404 storm on every page load. The mapping-load path re-schedules warmup.
    const hasMapping = this._itemIconMapping && Object.keys(this._itemIconMapping).length > 0;
    if (hasMapping) {
      for (const text of this._autocompleteItems) {
        const file = this._resolveItemIconFile({ summary: text, icon: null });
        const f = String(file || "");
        if (/\.svg$/i.test(f)) {
          const u = f.startsWith("http") || f.startsWith("/") ? f : `${base}/items/${f}`;
          urls.add(u);
        }
      }
    }
    // Static category SVGs + final fallback.
    for (const key of Object.keys(this._categorySvgs || {})) {
      urls.add(`${base}/categories/${key}.svg`);
    }
    urls.add(`${base}/items/sonstiges.svg`);
    // Only fetch what isn't already cached (DOM/RAM, persistent, or in-flight).
    const pc = this._getPersistentCache();
    const pending = [...urls].filter(
      u => !pc.has(u) && !this._svgTextCache.has(u) && !this._svgDomCache.has(u) && !this._svgInFlight.has(u)
    );
    if (pending.length === 0) return;
    // Stagger in small batches via idle callbacks so we don't saturate the
    // 6-connections-per-origin limit while the card may still be rendering.
    let i = 0;
    this._warmupStepHandle = null;
    const step = () => {
      const batch = pending.slice(i, i + 6);
      i += 6;
      Promise.all(batch.map(u => this._prefetchSvg(u))).then(() => {
        if (i < pending.length) {
          this._warmupStepHandle = typeof requestIdleCallback === "function"
            ? requestIdleCallback(step, { timeout: 4000 })
            : setTimeout(step, 200);
        } else {
          this._warmupStepHandle = null;
        }
      });
    };
    step();
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

  _renderItemIcon(container, item, size, lazy = false) {
    const summary = item?.summary || "";
    const override = this.config.icon_map?.[summary] || this.config.icon_map?.[String(summary).toLowerCase()];
    let iconValue = override;
    if (!iconValue) {
      const backendIcon = item?.icon;
      if (/\.(svg|png|jpg|jpeg)$/i.test(String(backendIcon))) iconValue = backendIcon;
    }
    if (!iconValue) iconValue = this._resolveItemIconFile(item);
    if (!iconValue || !/\.(svg|png|jpg|jpeg)$/i.test(String(iconValue))) iconValue = "sonstiges.svg";
    const base = this._getLocalIconBaseUrl();
    const url = iconValue.startsWith("http") || iconValue.startsWith("/") ? iconValue : `${base}/items/${iconValue}`;
    // D — category-default icon fallback. When an unknown article's guessed
    // item SVG 404s, fall back to the recognized category's static Flaticon SVG
    // (flat, visually consistent with the item tiles) before the final cart.
    // _itemCategoryKey uses the backend category if present, else the (now
    // stem-enhanced) _getItemCategory, so newly-added articles land on a
    // fitting category icon instead of the generic sonstiges cart.
    const catFallback = `${base}/categories/${this._itemCategoryKey(item) || "sonstiges"}.svg`;
    const finalFallback = `${base}/items/sonstiges.svg`;
    container.innerHTML = "";
    if (/\.(svg)$/i.test(url)) {
      // Inline SVG preferred: allows future CSS/SMIL animations and consistent scaling.
      const run = () => {
        this._loadSvgInline(url, container, size).then(loaded => {
          if (loaded) return;
          this._loadSvgInline(catFallback, container, size).then(c2 => {
            if (!c2) this._loadSvgInline(finalFallback, container, size);
          });
        });
      };
      // Lazy: defer the whole icon-load sequence until the tile scrolls near
      // the viewport, so offscreen backlog tiles don't fire SVG fetches during
      // the render pass. We always observe (no pre-check) because the tile is
      // still detached from the DOM here — getBoundingClientRect() would
      // return all zeros and falsely report every tile as in-viewport, which
      // silently defeated the optimization. The observer fires an initial
      // entry for tiles already visible on its first callback (~1 frame).
      if (lazy) {
        this._observeForLazy(container, run);
      } else {
        run();
      }
    } else {
      const img = document.createElement("img");
      img.src = url;
      img.style.width = size + "px";
      img.style.height = size + "px";
      img.style.flexShrink = "0";
      img.style.objectFit = "contain";
      img.alt = "";
      img.onerror = () => { img.src = finalFallback; };
      container.appendChild(img);
    }
  }

  _translit(s) {
    const key = String(s);
    if (this._translitCache.has(key)) return this._translitCache.get(key);
    const out = key.toLowerCase()
      .replace(/[ä]/g, "ae").replace(/[ö]/g, "oe").replace(/[ü]/g, "ue").replace(/[ß]/g, "ss");
    this._translitCache.set(key, out);
    return out;
  }

  // Reduce a (already lowercased) keyword to a stem by transliterating umlauts
  // and stripping ONE trailing inflection suffix (-en, -es, -er, -e, -s, -n),
  // but only if the resulting stem is at least 4 chars long. The length guard
  // prevents dangerous short stems like "ei" (from "eier") or "te" (from
  // "tee") that would match far too broadly.
  _stem(w) {
    let s = this._translit(w);
    const suffixes = ["en", "es", "er", "e", "s", "n"];
    for (const suf of suffixes) {
      if (s.length - suf.length >= 4 && s.endsWith(suf)) {
        s = s.slice(0, -suf.length);
        break;
      }
    }
    return s;
  }

  _getItemCategory(text) {
    const key = String(text || "").toLowerCase();
    if (this._categoryCache.has(key)) return this._categoryCache.get(key);
    // Pass 1: exact-keyword substring (unchanged). Catches exact words and
    // compounds that contain a full keyword verbatim ("Tomatenmark" <- "tomate").
    let result = "sonstiges";
    for (const [k, catKey] of this._catLookupEntries) {
      if (key.includes(k)) { result = catKey; break; }
    }
    // Pass 2: stem/substring match on the transliterated input. Catches
    // compounds that drop an inflection letter ("Erdbeerjoghurt" matches stem
    // "erdbeer" from keyword "erdbeere") and ASCII-typed umlaut words ("Kaese"
    // matches stem "kaes" from keyword "käse"). Longest stems first to prefer
    // the most specific category. Pass 1 takes priority, so stems only decide
    // words the exact pass missed.
    if (result === "sonstiges") {
      const n = this._translit(key);
      for (const [stem, catKey] of this._stemCatEntries) {
        if (n.includes(stem)) { result = catKey; break; }
      }
    }
    this._categoryCache.set(key, result);
    return result;
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

  _getCategoryBannerUrl(key) {
    const base = this.config?.category_banner_base_url || "/local/shopping-list-card/categories";
    return `${base}/${key || "sonstiges"}.png`;
  }

  _renderCategoryIcon(container, key, size, options = "") {
    const mode = this.config?.category_icon_mode || "inline";
    container.innerHTML = "";
    key = key || "sonstiges";
    if (mode === "inline") {
      const base = this._getLocalIconBaseUrl();
      const staticUrl = `${base}/categories/${key}.svg`;
      const fallbackSvg = this._categorySvgs?.[key] || this._categorySvgs?.sonstiges;
      // Try animated variant first (if not already known-missing for this key),
      // then static local SVG, then built-in fallback. Inline loading enables
      // CSS/SMIL animations inside the SVG. The per-key _noAnimatedSvg set
      // (persisted in localStorage) skips the animated probe once it has 404'd,
      // so later renders — and later sessions — go straight to the static URL
      // instead of replaying the 404 for every category header. The
      // `probe_animated: false` config flag disables the probe entirely, which
      // is useful once you know no animated variants exist and want to skip
      // the initial 404 round-trips altogether.
      const probeAnimated = this.config?.probe_animated !== false;
      const tryAnimated = probeAnimated && !this._noAnimatedSvg.has(key);
      const animatedUrl = tryAnimated ? `${base}/categories/animated/${key}.svg` : null;
      const probe = animatedUrl
        ? this._loadSvgInline(animatedUrl, container, size, options).then(loaded => {
            if (loaded) return true;
            this._markNoAnimatedSvg(key);
            return this._loadSvgInline(staticUrl, container, size, options);
          })
        : this._loadSvgInline(staticUrl, container, size, options);
      probe.then(loaded => {
        if (loaded) return;
        if (!fallbackSvg) return;
        const proto = this._parseSvgElement(fallbackSvg.trim());
        this._applySvgTo(container, proto, size, options);
      });
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
    if (this._renderRaf != null) {
      cancelAnimationFrame(this._renderRaf);
      this._renderRaf = null;
      this._renderPending = false;
    }
    if (this._unsub) {
      Promise.resolve(this._unsub).then(fn => fn());
      this._unsub = null;
    }
    if (this._unsubEvents) {
      Promise.resolve(this._unsubEvents).then(fn => fn());
      this._unsubEvents = null;
    }
    // Release the lazy-icon IntersectionObserver; observed nodes are dropped
    // by replaceChildren during teardown anyway, but disconnecting avoids a
    // dangling observer if the card is removed without a final render.
    if (this._lazyIconIO) {
      this._lazyIconIO.disconnect();
      this._lazyIconIO = null;
      this._lazyIconCallbacks = null;
    }
    // Cancel any pending background warmup so a detached card doesn't keep
    // firing fetches + localStorage writes after removal.
    this._clearWarmupHandle(this._warmupIdleHandle);
    this._clearWarmupHandle(this._warmupStepHandle);
    this._warmupIdleHandle = null;
    this._warmupStepHandle = null;
    // v2.4.0: cancel the trailing full-render debounce and any pending
    // delegated long-press so a detached card fires no further work.
    if (this._fullRenderTimer) {
      clearTimeout(this._fullRenderTimer);
      this._fullRenderTimer = null;
    }
    this._cancelPress();
    this._touchTile = null;
    this._touchAt = 0;
    this._longPressTile = null;
  }

  _lightUpdate() {
    // v2.4.0: tiles carry their entire visual state in data attributes; the
    // stylesheet (see _render) derives background/border/opacity/badge colors
    // from [data-status], so this pass only syncs datasets and the badge text
    // — no inline style writes at all.
    const itemMap = new Map();
    for (const item of this._items) itemMap.set(item.uid, item);

    const tiles = this.querySelectorAll(".sl-tile:not(.sl-ghost)");
    for (const tile of tiles) {
      const item = itemMap.get(tile.dataset.uid);
      if (!item) { tile.remove(); continue; } // stale tile (item deleted in backend)
      const qty = String(item.quantity || 1);
      if (tile.dataset.status === item.status && tile.dataset.qty === qty) continue;
      // v2.5.3: dataset/ARIA/badge rules are shared with _renderTile — see
      // _applyTileState. The guard above stays correct: aria-checked and the
      // aria-label derive from status + summary + quantity alone, so an unchanged
      // status/qty pair means nothing visible or announced changed either.
      this._applyTileState(tile, item);
    }

    // Count headers only in the ACTIVE sections. Mirror/backlog headers show
    // the full catalog count for their category (built by _renderMirrorSection),
    // which this needs_action-based recount would clobber with a wrong number.
    const cats = this.querySelectorAll('.sl-cat[data-section="active"]');
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

  // Static MDI chrome icon as inline SVG (falls back to <ha-icon> for
  // unknown names). Avoids instantiating the ha-icon custom element.
  _mdiEl(name, size, cssText) {
    const wrap = document.createElement("div");
    const html = mdiSvgString(name, size);
    if (html) {
      wrap.innerHTML = html;
    } else {
      const el = document.createElement("ha-icon");
      el.setAttribute("icon", "mdi:" + name);
      el.style.width = size + "px";
      el.style.height = size + "px";
      wrap.appendChild(el);
    }
    if (cssText) wrap.style.cssText = cssText;
    return wrap;
  }

  // "Noch nichts auf der Liste" row — shared by the initial render and the
  // surgical updater (_updateEmptyHint) so both produce the same markup.
  _buildEmptyHint() {
    const emptyRow = document.createElement("div");
    emptyRow.className = "sl-empty-hint";
    emptyRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 4px;color:var(--sl-text-muted);font-size:13px;";
    emptyRow.appendChild(this._mdiEl("cart-outline", 16, "width:16px;height:16px;color:var(--sl-text-muted);display:flex;flex-shrink:0;"));
    const t = document.createElement("span");
    t.textContent = "Noch nichts auf der Liste – unten tippen oder oben eingeben.";
    emptyRow.appendChild(t);
    return emptyRow;
  }

  _renderSearchBar() {
    const listWrap = document.createElement("div");
    listWrap.className = "sl-search";

    const searchWrap = document.createElement("div");
    searchWrap.style.cssText = "display:flex;align-items:center;background:var(--sl-bg-input);border-radius:12px;padding:0 12px;border:1px solid var(--sl-border);";
    searchWrap.appendChild(this._mdiEl("magnify", 20, "color:var(--sl-text-muted);width:20px;height:20px;margin-right:8px;display:flex;flex-shrink:0;"));
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

    if (this._items.length === 0) listWrap.appendChild(this._buildEmptyHint());

    const acDropdown = document.createElement("div");
    acDropdown.style.cssText = "position:absolute;top:100%;left:0;right:0;background:var(--sl-bg);border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:100;max-height:200px;overflow-y:auto;display:none;";
    listWrap.appendChild(acDropdown);
    let acMouseDown = false;
    acDropdown.addEventListener("mousedown", () => { acMouseDown = true; });

    const acItems = this._getAutocompleteItems();
    let searchTimer = null;
    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      // v2.4.0: track the active query on the instance so surgical updates
      // can bail to a full render while a filter is active, and a rebuild
      // can restore input text + filtering.
      this._searchQuery = val;
      this._searchText = input.value;
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
          row.className = "sl-ac-row";
          row.textContent = m;
          row.addEventListener("click", () => { this._addItem(m); input.value = ""; this._searchQuery = ""; this._searchText = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); });
          acDropdown.appendChild(row);
        });
        acDropdown.style.display = "block";
      } else {
        acDropdown.style.display = "none";
      }
      }, 150);
    });

    const doAdd = () => {
      if (input.value.trim()) { this._addItem(input.value); input.value = ""; this._searchQuery = ""; this._searchText = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); }
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

    // Restore a query that was active before the rebuild (search text survives
    // full renders now instead of silently clearing).
    if (this._searchQuery) {
      input.value = this._searchText || this._searchQuery;
      this._filterVisible(listWrap, this._searchQuery);
    }

    return listWrap;
  }

  _renderCategory(cat, catItems) {
    const catWrap = document.createElement("div");
    catWrap.className = "sl-cat";
    catWrap.dataset.section = "active";
    catWrap.dataset.cat = cat;
    catWrap.style.marginBottom = "16px";

    const header = document.createElement("div");
    header.className = "sl-header";
    const catColor = this._getCategoryColor(cat);
    const showCatLabels = this.config?.show_category_labels !== false;
    const useBanner = this.config?.category_banner_mode === true;
    if (useBanner) {
      // Banner-style category header: animated background image + dark overlay,
      // ensuring count/chevron remain readable. Fixed aspect-ratio via CSS class
      // keeps the banner proportional on desktop and mobile.
      header.className = "sl-header sl-banner-header";
      const banner = document.createElement("img");
      banner.className = "sl-cat-banner";
      banner.src = this._getCategoryBannerUrl(cat);
      banner.alt = "";
      banner.style.cssText = "animation:sl-cat-banner 18s ease-in-out infinite alternate;";
      banner.onerror = () => { banner.style.display = "none"; };
      header.appendChild(banner);
      const overlay = document.createElement("div");
      overlay.style.cssText = "position:absolute;inset:0;background:linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.35) 100%);z-index:1;border-radius:12px;";
      header.appendChild(overlay);
      const contentStyle = "position:relative;z-index:2;";
      const catIconWrap = document.createElement("div");
      catIconWrap.style.cssText = contentStyle + `display:flex;align-items:center;justify-content:center;color:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));`;
      this._renderCategoryIcon(catIconWrap, cat, 28);
      const catIconEl = catIconWrap.firstElementChild;
      if (catIconEl) catIconEl.style.filter = "drop-shadow(0 0 1px rgba(0,0,0,0.4))";
      header.appendChild(catIconWrap);
      if (showCatLabels) {
        const catName = document.createElement("div");
        catName.style.cssText = contentStyle + "font-weight:600;font-size:15px;flex:1;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);";
        catName.textContent = this._getCategoryName(cat);
        header.appendChild(catName);
      } else {
        const spacer = document.createElement("div");
        spacer.style.cssText = contentStyle + "flex:1;";
        header.appendChild(spacer);
      }
      const count = document.createElement("div");
      count.className = "sl-count";
      count.style.cssText = contentStyle + "font-size:12px;color:#fff;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,0.5);";
      count.textContent = catItems.length;
      header.appendChild(count);
      const chevron = this._mdiEl("chevron-down", 18, contentStyle + "color:#fff;width:18px;height:18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));");
      chevron.classList.add("sl-chevron");
      header.appendChild(chevron);
      catWrap.appendChild(header);
    } else {
      header.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid var(--sl-border);cursor:pointer;user-select:none;";
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-expanded", "true");
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
      const chevron = this._mdiEl("chevron-down", 18, "color:var(--sl-text-muted);width:18px;height:18px;");
      chevron.classList.add("sl-chevron");
      header.appendChild(chevron);
      catWrap.appendChild(header);
    }

    const grid = document.createElement("div");
    grid.className = "sl-grid";
    let collapsed = false;
    const toggle = () => {
      collapsed = !collapsed;
      grid.style.display = collapsed ? "none" : "grid";
      grid.dataset.collapsed = collapsed ? "true" : "";
      // v2.4.0: chevron is a static inline SVG; the collapse state rotates it
      // (down → -90° = right) instead of re-resolving an <ha-icon>.
      chevron.style.transform = collapsed ? "rotate(-90deg)" : "";
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

    grid.appendChild(this._buildAddTile());
    catWrap.appendChild(grid);
    return catWrap;
  }

  // The "+" tile appended to every active category grid. Its own method so the
  // surgical active-section rebuild can re-create it without touching
  // _renderCategory's header/toggle wiring. Hover feedback is pure CSS
  // (.sl-add-tile:hover) — the accent color comes from the --sl-accent /
  // --sl-accent-soft card variables set in _render.
  _buildAddTile() {
    const addTile = document.createElement("div");
    addTile.className = "sl-add-tile";
    addTile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border-radius:12px;border:2px dashed var(--sl-accent-soft);background:var(--sl-bg);cursor:pointer;min-height:72px;transition:all 0.15s;position:relative;";
    const plusIcon = this._mdiEl("plus", 22, "color:var(--sl-accent);width:22px;height:22px;display:flex;");
    addTile.appendChild(plusIcon);
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
          addTile.appendChild(this._mdiEl("plus", 22, "color:var(--sl-accent);width:22px;height:22px;display:flex;"));
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
              row.className = "sl-ac-row sm";
              row.textContent = m;
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
    return addTile;
  }

  // === Mirror / backlog feature =============================================
  // The "Verfügbar" catalog section below the list: every autocomplete article
  // not currently on the list, grouped by category, with a per-category
  // "Mehr laden". Self-contained — nothing outside this block depends on it
  // except the two gated call sites (_render and _applySurgicalUpdate), so the
  // whole feature can be switched off with `mirror: false` in the card config.
  // Shared catalog computation: every
  // autocomplete text that is NOT on the active list (plus completed extras
  // not in the catalog), grouped by category. Used by the full mirror render
  // AND by the surgical per-category mirror grid rebuild.
  _computeMirrorCatalog(items) {
    const onListSummaries = new Set(items.filter(i => i.status === "needs_action").map(i => i.summary.toLowerCase()));
    const itemBySummary = new Map();
    for (const item of items) itemBySummary.set(item.summary.toLowerCase(), item);
    const allArticles = this._getAutocompleteItems();
    const allAvail = [];
    const allAvailSet = new Set(); // parallel membership set → O(1) dedup below
    const acLower = new Set(allArticles.map(a => a.toLowerCase()));
    for (const text of allArticles) {
      if (onListSummaries.has(text.toLowerCase())) continue;
      allAvail.push(text);
      allAvailSet.add(text);
    }
    const completedExtras = items.filter(i => i.status === "completed" && !acLower.has(i.summary.toLowerCase()) && !onListSummaries.has(i.summary.toLowerCase()));
    for (const ci of completedExtras) {
      if (!allAvailSet.has(ci.summary)) {
        allAvail.push(ci.summary);
        allAvailSet.add(ci.summary);
      }
    }
    const byCat = {};
    for (const text of allAvail) {
      // Use the pre-computed autocomplete category cache; fall back to the
      // live lookup for completed extras that aren't in the autocomplete list.
      const cat = this._autocompleteCatCache.get(text) || this._getItemCategory(text);
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(text);
    }
    return { byCat, allAvail, itemBySummary };
  }

  _renderMirrorSection(items, order, maxPerCat = 20) {
    const { byCat: availByCat, allAvail, itemBySummary } = this._computeMirrorCatalog(items);
    if (allAvail.length === 0) return null;
    // Remember the limit the DOM was built with so surgical mirror rebuilds
    // don't shrink an expanded "Mehr laden"/"Alle anzeigen" section back to 20.
    this._mirrorMaxPerCat = maxPerCat;

    let hasAnyLimit = false;
    for (const cat of order) {
      if (availByCat[cat] && availByCat[cat].length > maxPerCat) { hasAnyLimit = true; break; }
    }

    const color = this._color;
    const mirrorWrap = document.createElement("div");
    // sl-mirror-wrap carries content-visibility:auto (see stylesheet in
    // _render) so the browser skips layout/paint of the large offscreen
    // backlog until it approaches the viewport.
    mirrorWrap.className = "sl-mirror-wrap";
    mirrorWrap.style.cssText = "margin-top:56px;padding-top:8px;";

    // Visual separator between active list and backlog/mirror section.
    const separator = document.createElement("div");
    separator.style.cssText = "display:flex;align-items:center;gap:14px;margin-bottom:20px;";
    const lineBase = "flex:1;height:3px;background:linear-gradient(90deg, transparent 0%, var(--sl-border) 15%, var(--sl-border) 85%, transparent 100%);border-radius:2px;box-shadow:0 1px 0 rgba(127,127,127,0.15);";
    const leftLine = document.createElement("div");
    leftLine.style.cssText = lineBase;
    const rightLine = document.createElement("div");
    rightLine.style.cssText = lineBase;
    const sepLabel = document.createElement("div");
    sepLabel.style.cssText = "display:flex;align-items:center;gap:8px;flex-shrink:0;padding:7px 16px;border-radius:999px;background:var(--sl-bg);border:2px solid var(--sl-border);color:var(--sl-text-muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;box-shadow:0 1px 2px rgba(0,0,0,0.05);";
    const sepIcon = this._mdiEl("archive-outline", 16, "display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;min-width:16px;min-height:16px;color:var(--sl-text-muted);");
    sepLabel.appendChild(sepIcon);
    const sepText = document.createElement("span");
    sepText.style.cssText = "white-space:nowrap;";
    sepText.textContent = "Verfügbar (" + allAvail.length + ")";
    sepLabel.appendChild(sepText);
    separator.appendChild(leftLine);
    separator.appendChild(sepLabel);
    separator.appendChild(rightLine);
    mirrorWrap.appendChild(separator);

    const mirrorTitle = document.createElement("div");
    mirrorTitle.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px;";
    const checkIcon = this._mdiEl("check-circle", 20, "color:var(--sl-text-muted);width:20px;height:20px;display:flex;");
    mirrorTitle.appendChild(checkIcon);
    const mt = document.createElement("div");
    mt.style.cssText = "font-weight:600;font-size:14px;color:var(--sl-text-muted);flex:1;";
    mt.textContent = "Backlog";
    mirrorTitle.appendChild(mt);
    const clearAll = document.createElement("div");
    clearAll.textContent = "erledigte löschen";
    clearAll.style.cssText = "font-size:11px;color:var(--sl-text-muted);cursor:pointer;";
    clearAll.addEventListener("click", () => this._clearDone());
    mirrorTitle.appendChild(clearAll);
    mirrorWrap.appendChild(mirrorTitle);

    // Build backlog category order, then force "sonstiges" to the very end.
    const mirrorDynamic = Object.keys(availByCat).filter(k => k !== "sonstiges");
    const mirrorOrder = [...new Set([...order.filter(k => k !== "sonstiges"), ...mirrorDynamic])];
    if (availByCat["sonstiges"]) mirrorOrder.push("sonstiges");

    for (const cat of mirrorOrder) {
      if (!availByCat[cat]) continue;
      const fullCatTexts = availByCat[cat];
      const isLimited = fullCatTexts.length > maxPerCat;
      const catTexts = isLimited ? fullCatTexts.slice(0, maxPerCat) : fullCatTexts;
      const catWrap = document.createElement("div");
      catWrap.className = "sl-cat";
      catWrap.dataset.section = "mirror";
      catWrap.dataset.cat = cat;
      catWrap.style.marginBottom = "12px";

      const header = document.createElement("div");
      header.className = "sl-header";
      const showCatLabels = this.config?.show_category_labels !== false;
      const useBanner = this.config?.category_banner_mode === true;
      const contentStyle = useBanner ? "position:relative;z-index:2;" : "";
      const catIconSize = useBanner ? 22 : (showCatLabels ? 16 : 22);
      const countColor = useBanner ? "#fff" : "var(--sl-text-muted)";
      const headerPadding = useBanner ? "8px 12px" : "6px 4px";

      // Chevron is declared early so the collapse toggle can reference it.
      const chevron = this._mdiEl("chevron-down", 16, "");
      chevron.classList.add("sl-chevron");

      if (useBanner) {
        header.className = "sl-header sl-banner-header";
        header.style.padding = headerPadding;
        const banner = document.createElement("img");
        banner.className = "sl-cat-banner";
        banner.src = this._getCategoryBannerUrl(cat);
        banner.alt = "";
        banner.style.cssText = "animation:sl-cat-banner 18s ease-in-out infinite alternate;opacity:0.55;filter:grayscale(25%);";
        banner.onerror = () => { banner.style.display = "none"; };
        header.appendChild(banner);
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:absolute;inset:0;background:linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.25) 100%);z-index:1;border-radius:12px;";
        header.appendChild(overlay);
      } else {
        header.style.cssText = "display:flex;align-items:center;gap:8px;padding:" + headerPadding + ";border-bottom:1px solid var(--sl-border);cursor:pointer;user-select:none;";
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        header.setAttribute("aria-expanded", "true");
      }

      const catIconWrap = document.createElement("div");
      catIconWrap.style.cssText = contentStyle + (useBanner
        ? "display:flex;align-items:center;justify-content:center;color:#fff;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.4));"
        : "display:flex;align-items:center;justify-content:center;color:var(--sl-text-muted);");
      this._renderCategoryIcon(catIconWrap, cat, catIconSize);
      const catIconEl = catIconWrap.firstElementChild;
      if (catIconEl) catIconEl.style.filter = useBanner ? "drop-shadow(0 0 1px rgba(0,0,0,0.4))" : "grayscale(100%) opacity(0.6)";
      header.appendChild(catIconWrap);

      if (showCatLabels) {
        const catName = document.createElement("div");
        catName.style.cssText = contentStyle + (useBanner
          ? "font-weight:600;font-size:13px;flex:1;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.5);"
          : "font-weight:500;font-size:12px;flex:1;color:var(--sl-text-muted);");
        catName.textContent = this._getCategoryName(cat);
        header.appendChild(catName);
      } else {
        const spacer = document.createElement("div");
        spacer.style.cssText = contentStyle + "flex:1;";
        header.appendChild(spacer);
      }

      const count = document.createElement("div");
      count.className = "sl-count";
      count.style.cssText = contentStyle + "font-size:11px;color:" + countColor + ";font-weight:" + (useBanner ? "700" : "400") + ";" + (useBanner ? "text-shadow:0 1px 2px rgba(0,0,0,0.5);" : "");
      count.textContent = fullCatTexts.length;
      header.appendChild(count);

      chevron.style.cssText = contentStyle + (useBanner
        ? "color:#fff;width:16px;height:16px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"
        : "color:var(--sl-text-muted);width:16px;height:16px;");
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
        // v2.4.0: chevron is a static inline SVG; the collapse state rotates it
      // (down → -90° = right) instead of re-resolving an <ha-icon>.
      chevron.style.transform = collapsed ? "rotate(-90deg)" : "";
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
        grid.appendChild(this._buildLoadMore(catWrap, grid, fullCatTexts, catTexts.length, itemBySummary, maxPerCat));
      }

      catWrap.appendChild(grid);
      mirrorWrap.appendChild(catWrap);
    }

    if (hasAnyLimit) {
      const showAll = document.createElement("div");
      // v2.4.0: hover feedback via .sl-more-btn:hover CSS rule, no JS listeners.
      showAll.className = "sl-more-btn";
      showAll.style.cssText = "margin-top:8px;";
      showAll.style.fontSize = "13px";
      showAll.style.color = "var(--sl-text-sec)";
      showAll.textContent = "Alle Artikel anzeigen";
      showAll.addEventListener("click", () => {
        const newMirror = this._renderMirrorSection(items, order, Infinity);
        if (newMirror) mirrorWrap.replaceWith(newMirror);
      });
      mirrorWrap.appendChild(showAll);
    }

    return mirrorWrap;
  }

  // v2.4.0: "Mehr laden" button for limited mirror categories. Extracted from
  // _renderMirrorSection so surgical grid rebuilds can re-append it; hover
  // feedback comes from .sl-more-btn:hover, no per-element JS listeners.
  _buildLoadMore(catWrap, grid, fullCatTexts, visibleCount, itemBySummary, maxPerCat) {
    const loadMore = document.createElement("div");
    loadMore.className = "sl-more-btn";
    loadMore.style.cssText = "margin-top:4px;grid-column:1 / -1;font-size:12px;color:var(--sl-text-muted);";
    loadMore.textContent = "Mehr laden (" + (fullCatTexts.length - visibleCount) + ")";
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
    return loadMore;
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
    // v2.4.0: tiles derive their chrome (background/border/opacity) from
    // [data-status] via the stylesheet below, so _lightUpdate/_applySurgicalUpdate
    // only sync datasets — no inline style writes per tile. Hover feedback is
    // pure CSS (no JS mouseenter/mouseleave listeners).
    card.style.setProperty("--sl-accent", this._color);
    card.style.setProperty("--sl-accent-soft", this._color + "60");
    const style = document.createElement("style");
    style.textContent = `
      .sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;padding:12px;}
      @media (max-width:400px){.sl-grid{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;padding:8px;}}
      @media (max-width:320px){.sl-grid{grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;}}
      .sl-banner-header{position:relative;overflow:hidden;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:12px;cursor:pointer;user-select:none;aspect-ratio:8/1;min-height:36px;max-height:68px;}
      @media (max-width:600px){.sl-banner-header{aspect-ratio:7/1;min-height:32px;}}
      @media (max-width:420px){.sl-banner-header{aspect-ratio:6/1;min-height:30px;}}
      .sl-cat-banner{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center;z-index:0;}
      @keyframes sl-cat-banner{0%{transform:scale(1) translate(0,0);}100%{transform:scale(1.05) translate(-1%,-0.5%);}}
      .sl-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;border-radius:12px;cursor:pointer;min-height:96px;position:relative;overflow:hidden;transition:all 0.15s;user-select:none;-webkit-touch-callout:none;-webkit-user-select:none;touch-action:manipulation;}
      .sl-tile[data-status="needs_action"]{background:var(--sl-accent);border:none;opacity:1;}
      .sl-tile[data-status="completed"]{background:var(--sl-bg);border:2px solid var(--sl-border);opacity:0.55;}
      .sl-tile.sl-ghost{background:var(--sl-bg);border:2px solid var(--sl-border);opacity:0.55;}
      .sl-tile:hover{opacity:0.8;}
      /* v2.5.2: keyboard focus ring. Tiles are focusable (tabindex 0) and the card
         previously had NO visible focus style at all. The plain :focus rule keeps
         the ring in older engines (where the two modern selectors below are
         dropped as invalid); :focus:not(:focus-visible) then hides it again for
         mouse/touch taps in engines that support :focus-visible, so only keyboard
         focus shows the ring. */
      .sl-tile:focus{outline:3px solid #2196F3;outline-offset:2px;}
      .sl-tile:focus:not(:focus-visible){outline:none;}
      .sl-icon-wrap{display:flex;align-items:center;justify-content:center;width:64px;height:64px;flex-shrink:0;z-index:1;}
      .sl-label-overlay{position:absolute;left:0;right:0;bottom:0;padding:4px 6px;z-index:2;background:linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 70%, transparent 100%);}
      .sl-label{font-size:10px;font-weight:600;text-align:center;color:#fff;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25;text-shadow:0 1px 2px rgba(0,0,0,0.5);}
      .sl-badge{position:absolute;top:4px;right:4px;z-index:3;display:inline-block;padding:2px 6px;border-radius:8px;font-size:9px;font-weight:700;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;backdrop-filter:blur(2px);}
      .sl-tile[data-status="completed"] .sl-badge{background:var(--sl-border);color:var(--sl-text-muted);}
      .sl-tile[data-status="needs_action"] .sl-badge{background:rgba(0,0,0,0.35);color:#fff;}
      .sl-chevron{transition:transform 0.15s ease;display:flex;align-items:center;justify-content:center;}
      .sl-search{margin-bottom:14px;position:relative;}
      .sl-ac-row{padding:10px 16px;cursor:pointer;font-size:15px;color:var(--sl-text);border-bottom:1px solid var(--sl-border);}
      .sl-ac-row.sm{padding:8px 12px;font-size:13px;}
      .sl-ac-row:hover{background:var(--sl-hover);}
      .sl-add-tile{display:flex;align-items:center;justify-content:center;min-height:96px;border-radius:12px;border:2px dashed var(--sl-accent-soft);background:var(--sl-bg);cursor:pointer;transition:all 0.15s;}
      .sl-add-tile:hover{background:var(--sl-hover);border-color:var(--sl-accent);}
      .sl-more-btn{display:flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:12px;background:var(--sl-bg-input);border:1px dashed var(--sl-border);cursor:pointer;transition:all 0.15s;}
      .sl-more-btn:hover{background:var(--sl-hover);border-color:var(--sl-accent);}
      .sl-mirror-wrap{content-visibility:auto;contain-intrinsic-size:auto 600px;}
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

    const defaultOrder = (this.config?.category_order || [
      "obst_gemuese","brot_backwaren","trockenwaren","milch_eier","fleisch_fisch",
      "getraenke","tiefkuehlprodukte","haushalt_hygiene"
    ]).filter(k => k !== "sonstiges");
    // Build the active category order, then force "sonstiges" to the very end
    // regardless of config order or dynamic category discovery.
    const dynamicOrder = Object.keys(groups).filter(k => k !== "sonstiges");
    const hasSonstiges = groups["sonstiges"]?.length > 0;
    const order = [...new Set([...defaultOrder, ...dynamicOrder])].filter(k => groups[k]?.length > 0);
    if (hasSonstiges) order.push("sonstiges");

    const activeOrder = order.filter(k => groups[k].some(i => i.status === "needs_action"));

    for (const cat of activeOrder) {
      const catItems = groups[cat].filter(i => i.status === "needs_action");
      card.appendChild(this._renderCategory(cat, catItems));
    }

    if (this._mirrorEnabled) {
      const mirror = this._renderMirrorSection(items, order);
      if (mirror) card.appendChild(mirror);
    }

    // v2.4.0: one card-level listener set replaces the per-tile listener suite
    // (click/touch/contextmenu/press). The card element is rebuilt on full
    // renders, so binding here keeps the delegation chain tied to the live DOM.
    this._bindCardEvents(card);
    this.replaceChildren(card);
    this._pruneStaleModal();
    // Kick off a background warmup of the persistent SVG cache in idle time
    // so the next render and scrolling offscreen tiles hit only the cache.
    // Guarded so repeated renders schedule at most one pending warmup.
    this._scheduleWarmup();
  }

  // v2.5.2: accessible name for a real tile. The quantity is invisible to a
  // screen reader otherwise, because role="checkbox" takes its name from
  // aria-label and ignores the badge's "Nx" text.
  _tileAriaLabel(item) {
    const q = item.quantity || 1;
    return q > 1 ? `${item.summary}, ${q} Stück` : item.summary;
  }

  // v2.5.3: single source of truth for a tile's mutable state. Both render paths
  // call it — _renderTile when a tile is built, _lightUpdate when an existing
  // tile's item changed — so the dataset/ARIA/badge rules live in one place
  // instead of being mirrored in two methods. (The v2.5.2 aria fix had to be
  // applied twice for exactly that reason.)
  _applyTileState(tile, item) {
    tile.dataset.status = item.status;
    tile.dataset.qty = String(item.quantity || 1);

    // v2.5.2: the list is a checkbox list — each entry is one tab stop and the
    // checked state is exposed via aria-checked. Space/Enter toggle and F2 opens
    // the edit modal, both via the keydown delegation in _bindCardEvents.
    tile.setAttribute("role", "checkbox");
    tile.tabIndex = 0;
    tile.setAttribute("aria-checked", item.status === "completed" ? "true" : "false");
    tile.setAttribute("aria-label", this._tileAriaLabel(item));
    tile.setAttribute("aria-keyshortcuts", "F2");

    // Quantity badge ("Nx") — created, updated or removed as needed. Colors and
    // placement come from the stylesheet (.sl-badge is position:absolute).
    let badge = tile.querySelector(".sl-badge");
    if ((item.quantity || 1) > 1) {
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "sl-badge";
        tile.appendChild(badge);
      }
      badge.textContent = (item.quantity || 1) + "x";
    } else if (badge) {
      badge.remove();
    }
  }

  _renderTile(item, catWrap) {
    // v2.4.0: listener-free tile. All visual state lives in data attributes; the
    // card stylesheet derives background/border/opacity/badge colors from
    // [data-status], and hover comes from .sl-tile:hover. Tap/long-press are
    // handled by the card-level delegation in _bindCardEvents — no per-tile
    // listeners (~11 per tile previously, ~1,500+ per full rebuild).
    const tile = document.createElement("div");
    tile.className = "sl-tile";
    tile.dataset.uid = item.uid;
    tile.dataset.summary = item.summary.toLowerCase();

    const iconWrap = document.createElement("div");
    iconWrap.className = "sl-icon-wrap";
    this._renderItemIcon(iconWrap, item, 56);
    tile.appendChild(iconWrap);

    const labelOverlay = document.createElement("div");
    labelOverlay.className = "sl-label-overlay";
    const label = document.createElement("div");
    label.className = "sl-label";
    label.textContent = item.summary;
    labelOverlay.appendChild(label);
    tile.appendChild(labelOverlay);

    // datasets + ARIA + quantity badge — shared with _lightUpdate's diff pass.
    // Called last so the badge keeps its slot as the final child.
    this._applyTileState(tile, item);

    if (catWrap) this._tileIndex.push({ tile, cat: catWrap, summary: item.summary.toLowerCase() });
    return tile;
  }

  _renderGhostTile(text, catWrap) {
    // v2.1.7: Ghost-Kacheln (Katalog-Artikel, die noch nicht auf der Liste stehen)
    // übernehmen exakt das Chrome der ERLEDIGTEN _renderTile-Kachel (neutraler
    // Hintergrund var(--sl-bg), 2px-Rahmen, opacity 0.55, 56px-Icon, weißes
    // Overlay-Label unten) — NICHT das der grünen Aktiv-Kachel. v2.1.6 hatte die
    // Ghosts grün eingefärbt, was im Backlog fälschlich als "aktiver Listen-
    // eintrag" las (z. B. Kirschen). Angleich an die erledigte Kachel (Avocado)
    // harmonisiert das gesamte Backlog zu einem ruhigen "verfügbar"-Look, ohne
    // grüne/aktive Kacheln. Die `sl-ghost`-Klasse bleibt erhalten, damit die
    // Refresh-Logik (`.sl-tile:not(.sl-ghost)`) Ghost-Kacheln weiterhin vom
    // diff/Update echter Items ausnimmt. Hover hellt dezent auf (0.55→0.8)
    // statt den Hintergrund grün/var(--sl-save) zu setzen, damit die
    // harmonisierte Optik beim Mouse-over erhalten bleibt.
    const tile = document.createElement("div");
    tile.className = "sl-tile sl-ghost";
    tile.dataset.summary = text.toLowerCase();
    tile.dataset.status = "ghost";
    // v2.4.0: original-case text for the delegated click handler — it adds the
    // item with original capitalization, like the old per-tile listener did.
    tile.dataset.addText = text;

    // v2.5.2: ghosts are buttons ("add to list"), one tab stop each; Space/Enter
    // adds the item (keydown delegation in _bindCardEvents).
    tile.setAttribute("role", "button");
    tile.tabIndex = 0;
    tile.setAttribute("aria-label", text + " zur Liste hinzufügen");

    const iconWrap = document.createElement("div");
    iconWrap.className = "sl-icon-wrap";
    // lazy=true: backlog tiles defer their SVG fetch until near the viewport,
    // so a full backlog render (~116 tiles) doesn't fire ~116 synchronous
    // SVG loads in one frame. First-screen tiles still load immediately.
    this._renderItemIcon(iconWrap, { summary: text, icon: null }, 56, true);
    tile.appendChild(iconWrap);

    const labelOverlay = document.createElement("div");
    labelOverlay.className = "sl-label-overlay";
    const label = document.createElement("div");
    label.className = "sl-label";
    label.textContent = text;
    labelOverlay.appendChild(label);
    tile.appendChild(labelOverlay);

    if (catWrap) this._tileIndex.push({ tile, cat: catWrap, summary: text.toLowerCase() });
    return tile;
  }

  // v2.4.0: card-level event delegation. Replaces the per-tile listener suite
  // (click, touchstart/move/end/cancel, mousedown/up/leave, contextmenu,
  // mouseenter/leave ≈ 11 listeners × ~150 tiles). Semantics match the old
  // per-tile handlers exactly:
  //  - Tap (mouse) toggles via click; tap (touch) toggles in touchend, and the
  //    trailing synthetic click is suppressed via _touchTile/_touchAt.
  //  - Ghost tiles toggle nothing — their click ADDS the item (original case
  //    via dataset.addText). They intentionally have no touch press path, so
  //    their click event is used on touch devices as well.
  //  - Long-press (500 ms hold, >12 px move cancels) opens the edit modal;
  //    the click after a fired long-press is suppressed via _longPressTile.
  //  - contextmenu on real tiles opens the modal too (right-click / long tap).
  _bindCardEvents(card) {
    card.addEventListener("click", e => {
      const tile = e.target.closest(".sl-tile");
      if (!tile) return;
      if (this._longPressTile === tile) return;
      const isGhost = tile.classList.contains("sl-ghost");
      if (!isGhost && this._touchTile === tile && Date.now() - this._touchAt < 400) return;
      if (isGhost) {
        this._addItem(tile.dataset.addText || tile.dataset.summary || "");
      } else {
        const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
        if (currentItem) this._toggleItem(currentItem);
      }
    });

    card.addEventListener("touchstart", e => {
      const tile = e.target.closest(".sl-tile");
      if (!tile || tile.classList.contains("sl-ghost")) return;
      this._touchTile = tile;
      this._touchAt = Date.now();
      this._startPress(tile, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });

    card.addEventListener("touchmove", e => {
      const p = this._press;
      if (!p) return;
      // Mouse presses carry no coordinates (x/y undefined) → NaN distance →
      // never cancels; the mouse path uses mouseout instead.
      const dx = e.touches[0].clientX - p.x;
      const dy = e.touches[0].clientY - p.y;
      if (Math.sqrt(dx * dx + dy * dy) > 12) this._cancelPress();
    }, { passive: true });

    card.addEventListener("touchend", e => {
      const p = this._press;
      const tile = e.target.closest(".sl-tile");
      const wasTap = p && p.timer && this._longPressTile !== p.tile;
      this._cancelPress();
      if (wasTap && tile === p.tile && !tile.classList.contains("sl-ghost")) {
        const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
        if (currentItem) this._toggleItem(currentItem);
      }
      setTimeout(() => { this._touchTile = null; this._touchAt = 0; }, 300);
    });

    card.addEventListener("touchcancel", () => {
      this._cancelPress();
      setTimeout(() => { this._touchTile = null; this._touchAt = 0; }, 300);
    });

    card.addEventListener("mousedown", e => {
      // Ignore the synthetic mouse events that trail a real touch.
      if (this._touchTile) return;
      const tile = e.target.closest(".sl-tile");
      if (!tile || tile.classList.contains("sl-ghost")) return;
      this._startPress(tile);
    });

    card.addEventListener("mouseup", () => this._cancelPress());

    card.addEventListener("mouseout", e => {
      const p = this._press;
      if (!p) return;
      // Leaving the pressed tile cancels the pending long press (old per-tile
      // mouseleave behavior). Moves between the tile's own children are fine.
      if (e.target.closest(".sl-tile") === p.tile &&
          !(e.relatedTarget && p.tile.contains(e.relatedTarget))) {
        this._cancelPress();
      }
    });

    card.addEventListener("contextmenu", e => {
      const tile = e.target.closest(".sl-tile");
      if (!tile || tile.classList.contains("sl-ghost")) return;
      e.preventDefault();
      this._cancelPress();
      this._fireLongPressTile(tile);
    });

    // v2.5.2: keyboard parity for the now-focusable tiles. Space/Enter performs
    // the primary action (toggle a real tile, add a ghost); F2 opens the edit
    // modal, mirroring the contextmenu path above. F2 is deliberate: the
    // ContextMenu key and Shift+F10 also raise a `contextmenu` event in most
    // engines, so handling those here would open the modal twice.
    card.addEventListener("keydown", e => {
      const tile = e.target.closest(".sl-tile");
      if (!tile) return;
      const isGhost = tile.classList.contains("sl-ghost");
      if (e.key === "F2") {
        if (isGhost) return;
        e.preventDefault();
        this._cancelPress();
        this._fireLongPressTile(tile);
        return;
      }
      if (e.key !== " " && e.key !== "Enter" && e.key !== "Spacebar") return;
      e.preventDefault(); // Space must not scroll the page
      if (isGhost) {
        this._addItem(tile.dataset.addText || tile.dataset.summary || "");
      } else {
        const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
        if (currentItem) this._toggleItem(currentItem);
      }
    });
  }

  _startPress(tile, x, y) {
    this._cancelPress();
    this._longPressTile = null;
    const timer = setTimeout(() => {
      this._press = null;
      this._fireLongPressTile(tile);
    }, 500);
    this._press = { tile, timer, x, y };
  }

  _cancelPress() {
    const p = this._press;
    if (p) { clearTimeout(p.timer); this._press = null; }
  }

  _fireLongPressTile(tile) {
    if (!tile || tile.classList.contains("sl-ghost")) return;
    if (this._longPressTile === tile) return; // already fired for this tile
    this._longPressTile = tile;
    this._haptic(80);
    const currentItem = this._items.find(i => i.uid === tile.dataset.uid);
    if (currentItem) this._showEditModal(currentItem, tile);
  }

  // v2.4.0: surgical update path. Instead of rebuilding the whole card on
  // every backend change, diff the previous vs current items and patch only
  // the affected category grids. The common interactions while shopping —
  // toggling an item, changing a quantity, removing one item — touch one or
  // two categories instead of re-rendering ~150 tiles. Anything structural
  // (active search filter, new category needing a fresh header, fingerprint
  // mismatch, mirror appearing/vanishing) bails with false → full render.
  // Returns true when the DOM is up to date and no full render is needed.
  _applySurgicalUpdate() {
    if (this._searchQuery) return false;
    const card = this.querySelector("ha-card");
    if (!card) return false;
    // A card without any section (missing-sensor message, fresh state) has
    // nothing to patch surgically.
    if (!card.querySelector(".sl-cat") && !card.querySelector(".sl-mirror-wrap")) return false;
    // The DOM must still correspond to the previous fingerprint — if not
    // (raced render, DOM touched elsewhere), only a rebuild is safe.
    if (this._fingerprintOf(this._prevItems || []) !== this._lastFingerprint) return false;

    const prev = this._prevItems || [];
    const cur = this._items;
    const prevByUid = new Map(prev.map(i => [i.uid, i]));
    const curByUid = new Map(cur.map(i => [i.uid, i]));
    const added = cur.filter(i => !prevByUid.has(i.uid));
    const removed = prev.filter(i => !curByUid.has(i.uid));
    const changed = cur.filter(i => {
      const p = prevByUid.get(i.uid);
      return p && (p.status !== i.status || p.summary !== i.summary ||
        String(p.quantity || 1) !== String(i.quantity || 1) ||
        (p.icon || "") !== (i.icon || ""));
    });
    if (!added.length && !removed.length && !changed.length) {
      // Only reachable when the fingerprint changed but no item field did →
      // the backend reordered items → full render to refresh tile order.
      return false;
    }

    // --- structural bail conditions ---
    // A category that just gained its first active item needs a fresh section
    // header (icon/banner wiring) → cheaper and safer to rebuild fully.
    const activeCatsBefore = new Set();
    for (const s of card.querySelectorAll('.sl-cat[data-section="active"]')) activeCatsBefore.add(s.dataset.cat);
    const activeCatsNow = new Set(cur.filter(i => i.status === "needs_action").map(i => this._itemCategoryKey(i)));
    for (const cat of activeCatsNow) if (!activeCatsBefore.has(cat)) return false;

    const catalogNow = this._computeMirrorCatalog(cur);
    const mirrorWrap = card.querySelector(".sl-mirror-wrap");
    // Mirror composition must stay section-compatible: no brand-new mirror
    // category, and the wrap exists exactly when there are available items.
    // Skipped when the mirror is off — nothing to keep compatible, and the check
    // would otherwise see a non-empty catalog with no wrap and bail to a full
    // render on every single update.
    if (this._mirrorEnabled) {
      const mirrorCatsNow = new Set(Object.keys(catalogNow.byCat));
      if (!mirrorWrap && mirrorCatsNow.size > 0) return false;
      if (mirrorWrap && mirrorCatsNow.size === 0) return false;
      if (mirrorWrap) {
        const mirrorCatsBefore = new Set();
        for (const s of card.querySelectorAll('.sl-cat[data-section="mirror"]')) mirrorCatsBefore.add(s.dataset.cat);
        for (const cat of mirrorCatsNow) if (!mirrorCatsBefore.has(cat)) return false;
      }
    }

    // --- touched categories (prev AND new: a summary edit may move category) ---
    const touched = new Set();
    for (const i of added) touched.add(this._itemCategoryKey(i));
    for (const i of removed) touched.add(this._itemCategoryKey(i));
    for (const i of changed) {
      touched.add(this._itemCategoryKey(i));
      touched.add(this._itemCategoryKey(prevByUid.get(i.uid)));
    }

    // --- patch active sections ---
    for (const cat of activeCatsBefore) {
      const section = card.querySelector('.sl-cat[data-section="active"][data-cat="' + cat + '"]');
      if (!section) continue;
      const needsNow = cur.filter(i => i.status === "needs_action" && this._itemCategoryKey(i) === cat);
      if (!needsNow.length) { section.remove(); continue; }
      if (touched.has(cat)) this._rebuildActiveGrid(section, needsNow);
      const count = section.querySelector(".sl-header .sl-count");
      if (count) count.textContent = needsNow.length;
    }

    // --- patch mirror sections ---
    if (mirrorWrap) {
      for (const cat of touched) {
        const section = card.querySelector('.sl-cat[data-section="mirror"][data-cat="' + cat + '"]');
        if (!section) continue;
        const texts = catalogNow.byCat[cat] || [];
        if (!texts.length) { section.remove(); continue; }
        this._rebuildMirrorGrid(section, texts, catalogNow.itemBySummary);
      }
      // Refresh the "Verfügbar (N)" separator count.
      for (const span of mirrorWrap.querySelectorAll("span")) {
        if (span.textContent.startsWith("Verfügbar (")) {
          span.textContent = "Verfügbar (" + catalogNow.allAvail.length + ")";
          break;
        }
      }
    }

    this._updateEmptyHint(card);
    this._rebuildTileIndex(card);
    this._pruneStaleModal();
    return true;
  }

  // Rebuild one active category's tile grid in place. Header, collapse toggle
  // wiring and the add-tile are preserved/re-created; the grid element itself
  // stays in the DOM, so its collapsed state survives.
  _rebuildActiveGrid(section, needsItems) {
    const grid = section.querySelector(".sl-grid");
    if (!grid) return;
    grid.replaceChildren();
    for (const item of needsItems) {
      const tile = this._renderTile(item, section);
      tile.dataset.section = "active";
      grid.appendChild(tile);
    }
    grid.appendChild(this._buildAddTile());
  }

  // Rebuild one mirror category's tile grid in place (same structure as
  // _renderMirrorSection's loop). Known trade-off: a per-category "Mehr laden"
  // expansion collapses back to _mirrorMaxPerCat tiles when this category gets
  // rebuilt; the "Alle anzeigen" (Infinity) state IS preserved.
  _rebuildMirrorGrid(section, texts, itemBySummary) {
    const grid = section.querySelector(".sl-grid");
    if (!grid) return;
    const maxPerCat = this._mirrorMaxPerCat || 20;
    grid.replaceChildren();
    const catTexts = texts.slice(0, maxPerCat);
    for (const text of catTexts) {
      const existing = itemBySummary.get(text.toLowerCase());
      if (existing) {
        const tile = this._renderTile(existing, section);
        tile.dataset.section = "mirror";
        grid.appendChild(tile);
      } else {
        grid.appendChild(this._renderGhostTile(text, section));
      }
    }
    if (texts.length > maxPerCat) {
      grid.appendChild(this._buildLoadMore(section, grid, texts, catTexts.length, itemBySummary, maxPerCat));
    }
    const count = section.querySelector(".sl-header .sl-count");
    if (count) count.textContent = texts.length;
  }

  // Keep the "list is empty" hint under the search bar in sync after surgical
  // updates (full renders rebuild it with the rest of the search bar).
  _updateEmptyHint(card) {
    const search = card.querySelector(".sl-search");
    if (!search) return;
    const hint = search.querySelector(".sl-empty-hint");
    if (this._items.length === 0 && !hint) {
      search.appendChild(this._buildEmptyHint());
    } else if (this._items.length > 0 && hint) {
      hint.remove();
    }
  }

  // Rebuild _tileIndex from the live DOM after surgical grid rebuilds — the
  // grid rebuilds pushed entries for their new tiles, but removed tiles'
  // entries and cross-category ordering are only consistent when derived
  // from the DOM itself.
  _rebuildTileIndex(card) {
    this._tileIndex = [];
    for (const cat of card.querySelectorAll(".sl-cat")) {
      for (const tile of cat.querySelectorAll(".sl-tile")) {
        this._tileIndex.push({ tile, cat, summary: tile.dataset.summary || "" });
      }
    }
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