class ShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this._itemsByList = {};
    this._unsub = null;
    this._debounceTimer = null;
    this._autocompleteItems = null;
    this._iconMap = null;
    this._catMap = null;
    this._renderedHash = "";
  }

  setConfig(config) {
    let lists;
    if (config.entity) {
      lists = [{
        entity: config.entity,
        name: config.name || config.entity,
        icon: config.icon || "mdi:cart",
        color: config.color || "#43A047"
      }];
    } else {
      if (!config.lists || !Array.isArray(config.lists)) {
        throw new Error('You need to define either "entity" or a "lists" array');
      }
      lists = config.lists;
    }
    this.config = {
      title: "Einkaufen",
      icon_map: {},
      ...config,
      lists: lists
    };
    this._initCaches();
    if (this._hass) this._fetchAndRender();
  }

  _initCaches() {
    this._autocompleteItems = [...new Set([
      "Apfel","Banane","Bananen","Birne","Kiwi","Orange","Mandarine","Trauben","Weintrauben","Kirschen","Erdbeeren","Himbeeren",
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

    this._iconLibrary = [
      "mdi:food-apple","mdi:food-apple-outline","mdi:food-carrot","mdi:food-corn",
      "mdi:food-croissant","mdi:food-drumstick","mdi:food-drumstick-outline","mdi:food-fish",
      "mdi:food-fish-outline","mdi:food-grain","mdi:food-steak","mdi:food-takeout-box",
      "mdi:food-turkey","mdi:food-variant","mdi:fruit-cherries","mdi:fruit-citrus",
      "mdi:fruit-grapes","mdi:fruit-pineapple","mdi:fruit-watermelon","mdi:egg",
      "mdi:egg-fried","mdi:egg-outline","mdi:cheese-burger","mdi:hamburger","mdi:noodle",
      "mdi:pasta","mdi:pizza","mdi:pizza-slice","mdi:bread-slice","mdi:bread-slice-outline",
      "mdi:cake","mdi:cake-layered","mdi:cake-variant","mdi:cookie","mdi:cookie-outline",
      "mdi:candy","mdi:candy-outline","mdi:candy-cane","mdi:ice-cream","mdi:coffee",
      "mdi:coffee-outline","mdi:coffee-maker","mdi:tea","mdi:tea-outline","mdi:cup",
      "mdi:cup-outline","mdi:cup-water","mdi:cup-off","mdi:glass-wine","mdi:glass-cocktail",
      "mdi:glass-mug","mdi:glass-mug-variant","mdi:beer","mdi:beer-outline","mdi:bottle-wine",
      "mdi:bottle-soda","mdi:bottle-soda-classic","mdi:fish","mdi:fish-off","mdi:carrot",
      "mdi:corn","mdi:mushroom","mdi:mushroom-outline","mdi:mushroom-off","mdi:onion",
      "mdi:garlic","mdi:pepper","mdi:watermelon","mdi:melon","mdi:orange","mdi:lemon",
      "mdi:lime","mdi:cherry","mdi:strawberry","mdi:apple","mdi:avocado","mdi:eggplant",
      "mdi:cucumber","mdi:potato","mdi:cart","mdi:cart-outline","mdi:cart-variant",
      "mdi:shopping","mdi:shopping-outline","mdi:shopping-search","mdi:gift","mdi:gift-outline",
      "mdi:home","mdi:home-outline","mdi:store","mdi:store-outline","mdi:store-24-hour",
      "mdi:package","mdi:package-variant","mdi:package-variant-closed","mdi:trash-can",
      "mdi:trash-can-outline","mdi:delete","mdi:delete-outline","mdi:paper-towel",
      "mdi:paper-towel-outline","mdi:toilet-paper","mdi:toilet-paper-outline","mdi:shower",
      "mdi:bathtub","mdi:toothbrush","mdi:toothbrush-paste","mdi:soap","mdi:shaker","mdi:shaker-outline","mdi:spray-bottle",
      "mdi:broom","mdi:vacuum-cleaner","mdi:lightbulb","mdi:lightbulb-outline","mdi:candle",
      "mdi:candle-fire","mdi:bandage","mdi:bandage-box","mdi:pill","mdi:hand-wash",
      "mdi:hand-water","mdi:water","mdi:water-well","mdi:bottle-water","mdi:bottle-wine-outline",
      "mdi:cup-water","mdi:gas-station","mdi:oil","mdi:flower","mdi:flower-outline","mdi:flower-tulip",
      "mdi:flower-tulip-outline","mdi:seed","mdi:seed-outline","mdi:tree","mdi:tree-outline",
      "mdi:account","mdi:account-outline","mdi:account-group","mdi:baby","mdi:baby-bottle",
      "mdi:cat","mdi:dog","mdi:paw","mdi:paw-outline","mdi:bird","mdi:fishbowl",
      "mdi:alpha-a","mdi:alpha-b","mdi:alpha-c","mdi:alpha-d","mdi:alpha-e",
      "mdi:alpha-f","mdi:alpha-g","mdi:alpha-h","mdi:alpha-i","mdi:alpha-j",
      "mdi:alpha-k","mdi:alpha-l","mdi:alpha-m","mdi:alpha-n","mdi:alpha-o",
      "mdi:alpha-p","mdi:alpha-q","mdi:alpha-r","mdi:alpha-s","mdi:alpha-t",
      "mdi:alpha-u","mdi:alpha-v","mdi:alpha-w","mdi:alpha-x","mdi:alpha-y",
      "mdi:alpha-z","mdi:numeric-0","mdi:numeric-1","mdi:numeric-2","mdi:numeric-3",
      "mdi:numeric-4","mdi:numeric-5","mdi:numeric-6","mdi:numeric-7","mdi:numeric-8",
      "mdi:numeric-9","mdi:heart","mdi:heart-outline","mdi:star","mdi:star-outline",
      "mdi:check","mdi:check-circle","mdi:check-circle-outline","mdi:close",
      "mdi:close-circle","mdi:close-circle-outline","mdi:information","mdi:information-outline",
      "mdi:help-circle","mdi:help-circle-outline","mdi:alert","mdi:alert-outline",
      "mdi:bell","mdi:bell-outline","mdi:magnify","mdi:magnify-minus","mdi:magnify-plus",
      "mdi:menu","mdi:dots-horizontal","mdi:dots-vertical","mdi:plus","mdi:plus-circle",
      "mdi:plus-circle-outline","mdi:minus","mdi:minus-circle","mdi:minus-circle-outline",
      "mdi:pencil","mdi:pencil-outline","mdi:trash-can","mdi:trash-can-outline",
      "mdi:bookmark","mdi:bookmark-outline","mdi:pin","mdi:pin-outline",
      "mdi:calendar","mdi:calendar-outline","mdi:clock","mdi:clock-outline",
      "mdi:timer","mdi:timer-outline","mdi:alarm","mdi:alarm-outline","mdi:weather-sunny",
      "mdi:weather-cloudy","mdi:weather-rainy","mdi:weather-snowy","mdi:weather-lightning",
      "mdi:car","mdi:car-outline","mdi:car-side","mdi:car-hatchback","mdi:truck",
      "mdi:truck-outline","mdi:bike","mdi:motorbike","mdi:bus","mdi:bus-side",
      "mdi:train","mdi:train-car","mdi:airplane","mdi:airplane-outline","mdi:helicopter",
      "mdi:rocket","mdi:rocket-outline","mdi:earth","mdi:earth-outline","mdi:map-marker",
      "mdi:map-marker-outline","mdi:navigation","mdi:compass","mdi:compass-outline",
      "mdi:flag","mdi:flag-outline","mdi:tag","mdi:tag-outline","mdi:label",
      "mdi:label-outline","mdi:bookmark-check","mdi:bookmark-check-outline","mdi:content-save",
      "mdi:content-save-outline","mdi:folder","mdi:folder-outline","mdi:file-document",
      "mdi:file-document-outline","mdi:clipboard-text","mdi:clipboard-text-outline",
      "mdi:note","mdi:note-outline","mdi:book","mdi:book-outline","mdi:library",
      "mdi:library-outline","mdi:newspaper","mdi:newspaper-variant","mdi:rss",
      "mdi:rss-box","mdi:email","mdi:email-outline","mdi:email-open","mdi:email-open-outline",
      "mdi:phone","mdi:phone-outline","mdi:cellphone","mdi:cellphone-basic",
      "mdi:laptop","mdi:monitor","mdi:television","mdi:television-classic",
      "mdi:remote-tv","mdi:gamepad","mdi:gamepad-variant","mdi:controller-classic",
      "mdi:headphones","mdi:headset","mdi:speaker","mdi:speaker-outline",
      "mdi:camera","mdi:camera-outline","mdi:video","mdi:video-outline","mdi:music",
      "mdi:music-note","mdi:music-note-outline","mdi:playlist-music","mdi:radio",
      "mdi:radio-outline","mdi:trophy","mdi:trophy-outline","mdi:medal","mdi:medal-outline",
      "mdi:crown","mdi:crown-outline","mdi:diamond","mdi:diamond-outline","mdi:emoticon",
      "mdi:emoticon-outline","mdi:emoticon-happy","mdi:emoticon-happy-outline",
      "mdi:emoticon-sad","mdi:emoticon-sad-outline","mdi:emoticon-cool",
      "mdi:emoticon-cool-outline","mdi:emoticon-neutral","mdi:emoticon-neutral-outline",
      "mdi:emoticon-angry","mdi:emoticon-angry-outline","mdi:face","mdi:face-outline",
      "mdi:face-man","mdi:face-man-outline","mdi:face-woman","mdi:face-woman-outline",
      "mdi:face-agent","mdi:face-agent-outline","mdi:robot","mdi:robot-outline",
      "mdi:alien","mdi:alien-outline","mdi:ghost","mdi:ghost-outline","mdi:skull",
      "mdi:skull-outline","mdi:pirate","mdi:pirate-outline","mdi:ninja","mdi:ninja-outline",
      "mdi:wizard-hat","mdi:run","mdi:run-fast","mdi:walk","mdi:human","mdi:human-female",
      "mdi:human-male","mdi:human-child","mdi:human-baby-changing-table","mdi:wheelchair",
      "mdi:stairs","mdi:elevator","mdi:escalator","mdi:fire","mdi:fire-extinguisher",
      "mdi:flash","mdi:flash-outline","mdi:flashlight","mdi:flashlight-outline",
      "mdi:lightning-bolt","mdi:lightning-bolt-outline","mdi:snowflake",
      "mdi:snowflake-variant","mdi:umbrella","mdi:umbrella-outline","mdi:sunglasses",
      "mdi:glasses","mdi:hat-fedora","mdi:tshirt-crew","mdi:tshirt-crew-outline",
      "mdi:shoe-sneaker","mdi:shoe-formal","mdi:tie","mdi:bow-tie","mdi:watch",
      "mdi:watch-outline","mdi:clock-digital","mdi:alarm-snooze","mdi:alarm-check",
      "mdi:bed","mdi:bed-outline","mdi:sofa","mdi:sofa-outline","mdi:table-chair",
      "mdi:fridge","mdi:fridge-outline","mdi:fridge-top","mdi:fridge-bottom",
      "mdi:stove","mdi:stove-outline","mdi:washing-machine","mdi:dishwasher",
      "mdi:microwave","mdi:microwave-outline","mdi:toaster","mdi:toaster-oven",
      "mdi:blender","mdi:coffee-maker-outline","mdi:kettle","mdi:kettle-outline",
      "mdi:kettle-steam","mdi:kettle-steam-outline","mdi:pot","mdi:pot-steam",
      "mdi:pot-steam-outline","mdi:pan","mdi:pan-outline","mdi:spoon-sugar",
      "mdi:scale","mdi:scale-outline","mdi:ruler","mdi:ruler-square","mdi:tape-measure",
      "mdi:scissors","mdi:scissors-cutting","mdi:needle","mdi:thread",
      "mdi:safety-goggles","mdi:hard-hat","mdi:hammer","mdi:hammer-screwdriver",
      "mdi:wrench","mdi:wrench-outline","mdi:screwdriver","mdi:screwdriver-outline",
      "mdi:drill","mdi:saw-blade","mdi:axe","mdi:shovel","mdi:palette",
      "mdi:palette-outline","mdi:paint-brush","mdi:paint-roller","mdi:format-paint",
      "mdi:draw","mdi:pencil-ruler","mdi:ruler-triangle","mdi:divider",
      "mdi:protractor","mdi:compass","mdi:compass-outline","mdi:map","mdi:map-outline",
      "mdi:globe-model","mdi:terrain","mdi:forest","mdi:pine-tree","mdi:pine-tree-box",
      "mdi:leaf","mdi:leaf-outline","mdi:leaf-maple","mdi:leaf-maple-outline",
      "mdi:flower-poppy","mdi:flower-poppy-outline","mdi:flower-rose",
      "mdi:flower-rose-outline","mdi:flower-tulip","mdi:flower-tulip-outline",
      "mdi:grass","mdi:shrub","mdi:barley","mdi:seed","mdi:seed-outline","mdi:grain",
      "mdi:garlic","mdi:ginger","mdi:peanut","mdi:peanut-outline","mdi:almond",
      "mdi:cashew","mdi:chestnut","mdi:hazelnut","mdi:pistachio","mdi:walnut",
      "mdi:cow","mdi:cow-outline","mdi:pig","mdi:pig-variant","mdi:pig-variant-outline",
      "mdi:sheep","mdi:duck","mdi:turkey","mdi:chicken","mdi:rabbit","mdi:rabbit-variant",
      "mdi:bee","mdi:bee-flower","mdi:bug","mdi:bug-outline","mdi:butterfly",
      "mdi:butterfly-outline","mdi:spider","mdi:spider-outline","mdi:snail",
      "mdi:snail-outline","mdi:turtle","mdi:turtle-outline","mdi:fishbowl",
      "mdi:fishbowl-outline","mdi:shark","mdi:shark-outline","mdi:whale",
      "mdi:whale-outline","mdi:dolphin","mdi:seal","mdi:penguin","mdi:penguin-outline",
      "mdi:owl","mdi:owl-outline","mdi:eagle","mdi:eagle-outline","mdi:parrot",
      "mdi:cat","mdi:cat-outline","mdi:dog","mdi:dog-side","mdi:dog-service",
      "mdi:horse","mdi:horse-variant","mdi:horse-variant-outline","mdi:elephant",
      "mdi:elephant-outline","mdi:snake","mdi:snake-outline","mdi:lizard",
      "mdi:lizard-outline","mdi:bat","mdi:bat-outline","mdi:spider-web",
      "mdi:spider-thread","mdi:fire-hydrant","mdi:fire-hydrant-alert",
      "mdi:fire-hydrant-off","mdi:hydrant","mdi:hydrant-outline",
      "si:github","si:apple","si:google","si:amazon","si:netflix","si:spotify",
      "si:twitter","si:facebook","si:instagram","si:youtube","si:discord","si:slack",
      "si:docker","si:kubernetes","si:nginx","si:apache","si:linux","si:windows",
      "si:android","si:ios","si:playstation","si:xbox","si:nintendo","si:steam",
      "si:visa","si:mastercard","si:paypal","si:bitcoin","si:ethereum",
      "phu:apple-logo","phu:carrot","phu:coffee","phu:fish","phu:hamburger",
      "phu:ice-cream","phu:orange","phu:pizza","phu:shopping-cart","phu:wine",
      "fluent:food-apple-24-filled","fluent:food-cake-24-filled","fluent:food-carrot-24-filled",
      "fluent:food-egg-24-filled","fluent:food-fish-24-filled","fluent:food-pizza-24-filled",
      "fluent:drink-coffee-24-filled","fluent:drink-wine-24-filled","fluent:drink-beer-24-filled",
      "hue:lightbulb","hue:lightbulb-group","hue:lightbulb-off","hue:outlet","hue:plug",
      "hue:motion-sensor","hue:contact-sensor","hue:tap-switch","hue:dimmer-switch",
      "fas:carrot","fas:apple-alt","fas:lemon","fas:fish","fas:hamburger","fas:pizza-slice",
      "fas:ice-cream","fas:cookie","fas:candy-cane","fas:mug-hot","fas:wine-glass-alt",
      "far:lemon","far:apple-alt","far:grin","far:sad-tear","far:smile","far:frown"
    ];

    this._iconMap = {
      eier:"1F95A", ei:"1F95A", apfel:"1F34E", äpfel:"1F34E", banane:"1F34C", bananen:"1F34C",
      birne:"1F350", birnen:"1F350", kiwi:"1F95D", orange:"1F34A", orangen:"1F34A",
      mandarine:"1F34A", traube:"1F347", trauben:"1F347", kirsche:"1F352", kirschen:"1F352",
      erdbeere:"1F353", erdbeeren:"1F353", himbeere:"1F353", himbeeren:"1F353", holunder:"1F347",
      heidelbeere:"1FAD0", heidelbeeren:"1FAD0", pfirsich:"1F351", pflaume:"1F351",
      zitrone:"1F34B", limette:"1F34B", grapefruit:"1F34A", melone:"1F348", ananas:"1F34D",
      mango:"1F96D", avocado:"1F951", tomate:"1F345", tomaten:"1F345", gurke:"1F952",
      paprika:"1FAD1", karotte:"1F955", karotten:"1F955", zucchini:"1F955", aubergine:"1F346",
      brokkoli:"1F966", blumenkohl:"1F966", spinat:"1F96C", blattspinat:"1F96C", salat:"1F96C",
      kartoffel:"1F954", kartoffeln:"1F954", zwiebel:"1F9C5", zwiebeln:"1F9C5", knoblauch:"1F9C4",
      lauch:"1F96C", schnittlauch:"1F96C", dill:"1F33F", frühlingszwiebel:"1F9C5", schalotte:"1F9C5",
      radieschen:"1F955", sellerie:"1F96C", "rote bete":"1F345", rotebete:"1F345", pilz:"1F344",
      champignon:"1F344", pfifferling:"1F344", steinpilz:"1F344", kräuterseitling:"1F344",
      austernpilz:"1F344", pilze:"1F344", gemüse:"1F955", obst:"1F353", frucht:"1F353",
      brot:"1F35E", brötchen:"1F35E", toast:"1F35E", semmel:"1F35E", baguette:"1F35E", "kräuterbaguette":"1F35E", "kräuterbaguettes":"1F35E",
      ciabatta:"1F35E", croissant:"1F950", croissants:"1F950", schrippe:"1F35E", weckle:"1F35E",
      laugenbrezel:"1F35E", brezel:"1F35E", milch:"1F95B", joghurt:"1FAD9", sahne:"mdi:cup-water",
      schmand:"1F95B", schlagsahne:"1F95B", butter:"1F9C8", käse:"1F9C0", quark:"1FAD9",
      frischkäse:"1F9C0", mozzarella:"1F9C0", brie:"1F9C0", gouda:"1F9C0", emmentaler:"1F9C0",
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
      fischstäbchen:"1F41F", pommes:"1F35F", eis:"mdi:ice-cream", eiskrem:"mdi:ice-cream",
      toilettenpapier:"1F9FB", küchenrolle:"1F9FB", papier:"1F4C4", taschentuch:"1F9FB",
      waschmittel:"1F9FC", spülmittel:"1FAE7", spüli:"1FAE7", zahnpasta:"1FAE5",
      zahnbürste:"1FAE5", shampoo:"1F9FC", duschgel:"1F9FC", seife:"mdi:soap",
      deodorant:"1F9F4", rasierer:"1FA92", dusch:"1F6BF", bad:"1F6BF", weichspüler:"mdi:washing-machine",
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
      hähnchenbrust:"1F357", hähnchenkeule:"1F357", kalbfleisch:"mdi:food-steak", kassler:"1F953",
      lamm:"1F411", leber:"1F969", lunge:"1F969", putenbrust:"1F357",
      putenschnitzel:"1F357", rinderfilet:"1F969", rinderhack:"1F969",
      rinderroulade:"1F969", rollmops:"1F41F", sülze:"1F963", zander:"1F41F",
      backpulver:"1F9C2", balsamico:"1F9C2", brühe:"1F963", gnocchi:"1F35D",
      haferflocken:"1F33E", kartoffelstärke:"1F33E", kichererbsen:"1F96C",
      kidneybohnen:"1F96C", linsen:"1F96C", paniermehl:"1F33E", pesto:"1F33F",
      polenta:"1F35A", rosinen:"1F347", sahnesteif:"mdi:shaker", sojasoße:"1F963",
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
      leinöl:"mdi:oil", lotion:"1F9F5", lufterfrischer:"1F33F", "make-up":"1F484",
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
  }

  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;
    if (!oldHass) this._subscribeChanges();
    if (!oldHass || this._shouldRender(oldHass, hass)) this._fetchAndRender();
  }

  async _fetchAndRender() {
    this._debounceTimer && clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(async () => {
      this._debounceTimer = null;
      await this._updateItems(this._hass);
      this._render();
    }, 0);
  }

  async _updateItems(hass) {
    if (!hass || !this.config?.lists) return;
    const promises = this.config.lists.map(async (list) => {
      const entityId = list.entity;
      try {
        const state = hass.states[entityId];
        if (state?.attributes?.todo_items) {
          this._itemsByList[entityId] = state.attributes.todo_items;
          return;
        }
        const res = await hass.callWS({
          type: "call_service",
          domain: "todo",
          service: "get_items",
          service_data: { entity_id: entityId, status: ["needs_action", "completed"] },
          return_response: true
        });
        const resp = res?.result?.response || res?.response;
        const items = resp?.[entityId]?.items || [];
        this._itemsByList[entityId] = items;
      } catch (e) {
        console.warn("Shopping List Card: Failed to fetch items for", entityId, e);
        this._itemsByList[entityId] = [];
      }
    });
    await Promise.all(promises);
  }

  _shouldRender(oldHass, newHass) {
    if (!this.config?.lists) return false;
    for (const list of this.config.lists) {
      const id = list.entity;
      const oldState = oldHass.states[id];
      const newState = newHass.states[id];
      if (!oldState || !newState) return true;
      if (oldState.last_changed !== newState.last_changed) return true;
      if (oldState.last_updated !== newState.last_updated) return true;
      const oldItems = oldState.attributes?.todo_items || [];
      const newItems = newState.attributes?.todo_items || [];
      if (oldItems.length !== newItems.length) return true;
      const oldHash = oldItems.map(i => i.uid + ":" + i.summary + (i.description || "") + i.status).join("|");
      const newHash = newItems.map(i => i.uid + ":" + i.summary + (i.description || "") + i.status).join("|");
      if (oldHash !== newHash) return true;
    }
    return false;
  }

  _filterVisible(listWrap, query) {
    const card = listWrap.parentElement;
    const cats = card.querySelectorAll(".sl-cat");
    for (const cat of cats) {
      const tiles = cat.querySelectorAll("[data-summary]");
      let visible = 0;
      for (const tile of tiles) {
        const match = !query || tile.dataset.summary.includes(query);
        tile.style.display = match ? "flex" : "none";
        if (match) visible++;
      }
      const header = cat.querySelector(".sl-header");
      const grid = cat.querySelector(".sl-grid");
      if (header) header.style.display = visible > 0 ? "" : "none";
      if (grid) {
        if (visible > 0) {
          grid.style.display = grid.dataset.collapsed === "true" ? "none" : "grid";
        } else {
          grid.style.display = "none";
        }
      }
    }
  }

  _getOpenmojiUrl(hex) {
    return `https://cdn.jsdelivr.net/npm/openmoji@latest/color/svg/${hex}.svg`;
  }

  _createOpenmojiImg(hex, size) {
    const img = document.createElement("img");
    img.src = this._getOpenmojiUrl(hex);
    img.style.width = size + "px";
    img.style.height = size + "px";
    img.style.flexShrink = "0";
    img.style.objectFit = "contain";
    img.alt = "";
    return img;
  }

  _getItemIcon(text) {
    const t = text.toLowerCase();
    const map = this.config.icon_map || {};
    if (map[text]) return map[text];
    for (const [key, hex] of this._iconMapEntries) {
      if (t.includes(key)) return hex;
    }
    return "1F6D2";
  }

  _parseDescription(desc) {
    if (!desc) return { icon: null, text: "" };
    const match = desc.match(/^\[([a-z]+:[\w-]+)\]\s*(.*)$/);
    if (match) return { icon: match[1], text: match[2] };
    return { icon: null, text: desc };
  }

  _renderItemIcon(container, item, size) {
    const { icon } = this._parseDescription(item?.description);
    container.innerHTML = "";
    if (icon) {
      const el = document.createElement("ha-icon");
      el.setAttribute("icon", icon);
      el.style.cssText = `width:${size}px;height:${size}px;color:inherit;`;
      container.appendChild(el);
    } else {
      const map = this.config?.icon_map || {};
      const mapped = map[item?.summary];
      const iconValue = mapped && /^[a-z]+:/.test(String(mapped)) ? mapped : this._getItemIcon(item?.summary || "");
      if (iconValue && /^[a-z]+:/.test(String(iconValue))) {
        const el = document.createElement("ha-icon");
        el.setAttribute("icon", iconValue);
        el.style.cssText = `width:${size}px;height:${size}px;color:inherit;`;
        container.appendChild(el);
      } else {
        const img = this._createOpenmojiImg(iconValue || "1F6D2", size);
        container.appendChild(img);
      }
    }
  }

  _getItemCategory(text) {
    const t = text.toLowerCase();
    for (const cat of this._catMap) {
      for (const key of cat.keys) {
        if (t.includes(key)) return cat.key;
      }
    }
    return "sonstiges";
  }

  _getCategoryName(key) {
    return {
      obst_gemuese: "Obst & Gemüse",
      brot_backwaren: "Brot & Backwaren",
      milch_eier: "Milchprodukte & Eier",
      fleisch_fisch: "Fleisch, Fisch & Alternativen",
      trockenwaren: "Trockenwaren & Vorräte",
      tiefkuehlprodukte: "Tiefkühlprodukte",
      getraenke: "Getränke",
      haushalt_hygiene: "Haushalt & Hygiene",
      sonstiges: "Sonstiges"
    }[key] || key;
  }

  _getCategoryIcon(key) {
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

  _findItemBySummary(entityId, text) {
    const items = this._itemsByList[entityId] || [];
    return items.find(item => item.summary.toLowerCase() === text.toLowerCase()) || null;
  }

  _showToast(msg) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:10px 18px;border-radius:24px;font-size:14px;z-index:10000;opacity:0;transition:opacity 0.3s ease;";
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

  _callService(domain, service, data) {
    if (!this._hass) return Promise.resolve();
    return this._hass.callService(domain, service, data).catch(e => {
      console.warn("Shopping List Card: Service call failed", domain, service, e);
      this._showToast("Fehler: " + (e.message || "Service-Aufruf fehlgeschlagen"));
    });
  }

  _addItem(entityId, text) {
    const val = text.trim();
    if (!val || !this._hass) return;
    const existing = this._findItemBySummary(entityId, val);
    if (existing) {
      if (existing.status === "needs_action") {
        this._showToast("'" + val + "' ist bereits auf der Liste");
        this._haptic(30);
        return;
      }
      this._callService("todo", "update_item", { entity_id: entityId, item: existing.summary, status: "needs_action" });
      this._haptic(60);
      return;
    }
    this._callService("todo", "add_item", { entity_id: entityId, item: val });
    this._haptic(60);
  }

  _toggleItem(entityId, item) {
    if (!this._hass) return;
    const status = item.status === "completed" ? "needs_action" : "completed";
    this._callService("todo", "update_item", { entity_id: entityId, item: item.summary, status: status });
    this._haptic(status === "needs_action" ? 40 : 60);
  }

  _removeItem(entityId, item) {
    if (!this._hass) return;
    this._callService("todo", "remove_item", { entity_id: entityId, item: item.summary });
    this._haptic(40);
  }

  _clearDone(entityId) {
    if (!this._hass) return;
    this._callService("todo", "remove_completed_items", { entity_id: entityId });
    this._haptic(80);
  }

  _updateDescription(entityId, item, desc) {
    if (!this._hass) return;
    this._callService("todo", "update_item", { entity_id: entityId, item: item.summary, description: desc });
    this._haptic(40);
  }

  _subscribeChanges() {
    if (this._unsub || !this._hass || !this.isConnected) return;
    const entities = this.config?.lists?.map(l => l.entity) || [];
    this._unsub = this._hass.connection.subscribeEvents(ev => {
      if (entities.includes(ev.data.entity_id)) this._fetchAndRender();
    }, "state_changed");
  }

  connectedCallback() { this._subscribeChanges(); }
  disconnectedCallback() { this._unsub && (this._unsub(), this._unsub = null); }

  _lightUpdate() {
    for (const list of this.config.lists) {
      const items = this._itemsByList[list.entity] || [];
      const itemMap = new Map();
      for (const item of items) itemMap.set(item.uid, item);
      const color = list.color || "#43A047";

      const tiles = this.querySelectorAll(`[data-entity="${list.entity}"].sl-tile`);
      for (const tile of tiles) {
        const item = itemMap.get(tile.dataset.uid);
        if (!item) continue;
        if (tile.dataset.status === item.status) continue;

        const isDone = item.status === "completed";
        tile.dataset.status = item.status;
        tile.style.background = isDone ? "#e0e0e0" : color;
        tile.style.border = isDone ? "2px solid #bbb" : "none";
        tile.style.opacity = isDone ? "0.55" : "1";

        const label = tile.querySelector(".sl-label");
        if (label) {
          label.style.color = isDone ? "#999" : "#fff";
          label.style.textDecoration = isDone ? "line-through" : "none";
        }

        const badge = tile.querySelector(".sl-badge");
        if (badge) {
          badge.style.background = isDone ? "#ccc" : "rgba(255,255,255,0.25)";
          badge.style.color = isDone ? "#666" : "#fff";
        }

        const { text: newDescText } = this._parseDescription(item.description || "");
        const oldDescText = tile.querySelector(".sl-badge")?.textContent || "";
        if (oldDescText !== newDescText) {
          if (!newDescText) {
            const b = tile.querySelector(".sl-badge");
            b && b.remove();
          } else {
            let b = tile.querySelector(".sl-badge");
            if (b) {
              b.textContent = newDescText;
            } else {
              b = document.createElement("div");
              b.className = "sl-badge";
              b.style.cssText = "display:inline-block;padding:2px 6px;border-radius:8px;background:" + (isDone ? "#ccc" : "rgba(255,255,255,0.25)") + ";color:" + (isDone ? "#666" : "#fff") + ";font-size:9px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;";
              b.textContent = newDescText;
              tile.appendChild(b);
            }
          }
        }
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

    const modal = document.querySelector(".shopping-list-modal");
    if (modal) {
      const modalUid = modal.dataset.itemUid;
      const modalEntity = modal.dataset.itemEntity;
      if (modalUid && modalEntity) {
        const items = this._itemsByList[modalEntity] || [];
        if (!items.some(i => i.uid === modalUid)) modal.remove();
      }
    }
  }

  _renderSearchBar(list) {
    const listWrap = document.createElement("div");
    listWrap.style.cssText = "margin-bottom:14px;position:relative;";
    const color = list.color || "#43A047";

    const searchWrap = document.createElement("div");
    searchWrap.style.cssText = "display:flex;align-items:center;background:#fafafa;border-radius:12px;padding:0 12px;border:1px solid #e8e8e8;";
    const searchIcon = document.createElement("ha-icon");
    searchIcon.setAttribute("icon", "mdi:magnify");
    searchIcon.style.cssText = "color:#aaa;width:20px;height:20px;margin-right:8px;";
    searchWrap.appendChild(searchIcon);
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Artikel suchen oder hinzufügen...";
    input.style.cssText = "flex:1;border:none;background:transparent;font-size:16px;padding:12px 0;outline:none;color:#333;";
    searchWrap.appendChild(input);
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "+";
    addBtn.style.cssText = "background:transparent;color:#888;border:none;border-radius:50%;width:32px;height:32px;font-size:22px;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
    searchWrap.appendChild(addBtn);
    listWrap.appendChild(searchWrap);

    const hasItems = (this._itemsByList[list.entity] || []).length > 0;
    if (!hasItems) {
      const loadingRow = document.createElement("div");
      loadingRow.style.cssText = "display:flex;align-items:center;gap:6px;padding:8px 4px;color:#999;font-size:13px;";
      const spin = document.createElement("ha-icon");
      spin.setAttribute("icon", "mdi:loading");
      spin.style.cssText = "width:16px;height:16px;color:#aaa;animation:sl-spin 1s linear infinite;";
      loadingRow.appendChild(spin);
      const lt = document.createElement("span");
      lt.textContent = "Artikel werden geladen...";
      loadingRow.appendChild(lt);
      listWrap.appendChild(loadingRow);
    }

    const acDropdown = document.createElement("div");
    acDropdown.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:100;max-height:200px;overflow-y:auto;display:none;";
    listWrap.appendChild(acDropdown);
    let acMouseDown = false;
    acDropdown.addEventListener("mousedown", () => { acMouseDown = true; });

    const acItems = this._getAutocompleteItems();
    input.addEventListener("input", () => {
      const val = input.value.toLowerCase().trim();
      acDropdown.innerHTML = "";
      this._filterVisible(listWrap, val);
      if (!val) { acDropdown.style.display = "none"; return; }
      const matches = acItems.filter(it => {
        const existing = this._findItemBySummary(list.entity, it);
        return !(existing && existing.status === "needs_action");
      }).slice(0, 8);
      if (matches.length) {
        matches.forEach(m => {
          const row = document.createElement("div");
          row.style.cssText = "padding:10px 16px;cursor:pointer;font-size:15px;color:#333;border-bottom:1px solid #e0e0e0;";
          row.textContent = m;
          row.addEventListener("mouseenter", () => row.style.background = "#e8f5e9");
          row.addEventListener("mouseleave", () => row.style.background = "#fff");
          row.addEventListener("click", () => { this._addItem(list.entity, m); input.value = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); });
          acDropdown.appendChild(row);
        });
        acDropdown.style.display = "block";
      } else {
        acDropdown.style.display = "none";
      }
    });

    const doAdd = () => {
      if (input.value.trim()) { this._addItem(list.entity, input.value); input.value = ""; acDropdown.style.display = "none"; this._filterVisible(listWrap, ""); }
    };
    addBtn.addEventListener("click", doAdd);
    input.addEventListener("keydown", e => { if (e.key === "Enter") doAdd(); });
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!acMouseDown) { acDropdown.style.display = "none"; if (!input.value.trim()) this._filterVisible(listWrap, ""); }
        acMouseDown = false;
      }, 200);
    });
    input.addEventListener("focus", () => { if (input.value.trim()) input.dispatchEvent(new Event("input")); });

    return listWrap;
  }

  _renderCategory(cat, catItems, list, color) {
    const catWrap = document.createElement("div");
    catWrap.className = "sl-cat";
    catWrap.style.marginBottom = "16px";

    const header = document.createElement("div");
    header.className = "sl-header";
    header.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #e8e8e8;cursor:pointer;user-select:none;";
    const catColor = this._getCategoryColor(cat);
    const catIcon = this._createOpenmojiImg(this._getCategoryIcon(cat), 20);
    catIcon.style.filter = "drop-shadow(0 0 1px rgba(0,0,0,0.2))";
    header.appendChild(catIcon);
    const catName = document.createElement("div");
    catName.style.cssText = "font-weight:500;font-size:14px;flex:1;color:" + catColor;
    catName.textContent = this._getCategoryName(cat);
    header.appendChild(catName);
    const count = document.createElement("div");
    count.className = "sl-count";
    count.style.cssText = "font-size:12px;color:#999;font-weight:400;";
    count.textContent = catItems.length;
    header.appendChild(count);
    const chevron = document.createElement("ha-icon");
    chevron.setAttribute("icon", "mdi:chevron-down");
    chevron.style.cssText = "color:#bbb;width:18px;height:18px;";
    header.appendChild(chevron);
    catWrap.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "sl-grid";
    grid.className = "sl-grid";
    let collapsed = false;
    header.addEventListener("click", () => {
      collapsed = !collapsed;
      grid.style.display = collapsed ? "none" : "grid";
      grid.dataset.collapsed = collapsed ? "true" : "";
      chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
    });

    for (const item of catItems) {
      const tile = this._renderTile(item, list.entity, color);
      tile.dataset.section = "active";
      grid.appendChild(tile);
    }

    const addTile = document.createElement("div");
    addTile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border-radius:12px;border:2px dashed " + color + "60;background:#fff;cursor:pointer;min-height:72px;transition:all 0.15s;position:relative;";
    const plusIcon = document.createElement("ha-icon");
    plusIcon.setAttribute("icon", "mdi:plus");
    plusIcon.style.cssText = "color:" + color + ";width:22px;height:22px;";
    addTile.appendChild(plusIcon);
    addTile.addEventListener("mouseenter", () => { addTile.style.background = "#e8f5e9"; addTile.style.borderColor = color; });
    addTile.addEventListener("mouseleave", () => { addTile.style.background = "#fff"; addTile.style.borderColor = color + "60"; });
    let tileInput = null;
    let tileAcMouseDown = false;
    addTile.addEventListener("click", () => {
      if (!tileInput) {
        addTile.innerHTML = "";
        const tileAc = document.createElement("div");
        tileAc.style.cssText = "position:absolute;top:100%;left:50%;transform:translateX(-50%);width:min(180px,80vw);background:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:200;max-height:160px;overflow-y:auto;display:none;";
        tileAc.addEventListener("mousedown", () => { tileAcMouseDown = true; });
        tileInput = document.createElement("input");
        tileInput.type = "text";
        tileInput.placeholder = "...";
        tileInput.style.cssText = "width:100%;border:none;background:transparent;color:#333;font-size:13px;text-align:center;outline:none;";
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
            const existing = this._findItemBySummary(list.entity, it);
            return !(existing && existing.status === "needs_action");
          }).slice(0, 6);
          if (matches.length) {
            matches.forEach(m => {
              const row = document.createElement("div");
              row.style.cssText = "padding:8px 12px;cursor:pointer;font-size:13px;color:#333;border-bottom:1px solid #e0e0e0;";
              row.textContent = m;
              row.addEventListener("mouseenter", () => row.style.background = "#e8f5e9");
              row.addEventListener("mouseleave", () => row.style.background = "#fff");
              row.addEventListener("click", () => { this._addItem(list.entity, m); resetTile(); });
              tileAc.appendChild(row);
            });
            tileAc.style.display = "block";
          } else {
            tileAc.style.display = "none";
          }
        });
        tileInput.addEventListener("keydown", e => { if (e.key === "Enter") { this._addItem(list.entity, tileInput.value); resetTile(); } });
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

  _renderMirrorSection(list, items, color, order, maxPerCat = 20) {
    const onListSummaries = new Set(items.filter(i => i.status === "needs_action").map(i => i.summary.toLowerCase()));
    const allArticles = this._getAutocompleteItems();
    const allAvail = [];
    const acLower = new Set(allArticles.map(a => a.toLowerCase()));
    for (const text of allArticles) {
      if (onListSummaries.has(text.toLowerCase())) continue;
      allAvail.push(text);
    }
    const allItems = this._itemsByList[list.entity] || [];
    const completedExtras = allItems.filter(i => i.status === "completed" && !acLower.has(i.summary.toLowerCase()) && !onListSummaries.has(i.summary.toLowerCase()));
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

    const mirrorWrap = document.createElement("div");
    mirrorWrap.style.cssText = "margin-top:24px;padding-top:16px;border-top:2px dashed #ccc;";

    const mirrorTitle = document.createElement("div");
    mirrorTitle.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:12px;padding:0 4px;";
    const checkIcon = document.createElement("ha-icon");
    checkIcon.setAttribute("icon", "mdi:check-circle");
    checkIcon.style.cssText = "color:#aaa;width:20px;height:20px;";
    mirrorTitle.appendChild(checkIcon);
    const mt = document.createElement("div");
    mt.style.cssText = "font-weight:600;font-size:14px;color:#999;flex:1;";
    mt.textContent = "Verfügbar (" + allAvail.length + ")";
    mirrorTitle.appendChild(mt);
    const clearAll = document.createElement("div");
    clearAll.textContent = "erledigte löschen";
    clearAll.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;";
    clearAll.addEventListener("click", () => this._clearDone(list.entity));
    mirrorTitle.appendChild(clearAll);
    mirrorWrap.appendChild(mirrorTitle);

    for (const cat of order) {
      if (!availByCat[cat]) continue;
      const fullCatTexts = availByCat[cat];
      const isLimited = fullCatTexts.length > maxPerCat;
      const catTexts = isLimited ? fullCatTexts.slice(0, maxPerCat) : fullCatTexts;
      const catWrap = document.createElement("div");
      catWrap.className = "sl-cat";
      catWrap.style.marginBottom = "12px";

      const header = document.createElement("div");
      header.className = "sl-header";
      header.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f0f0f0;cursor:pointer;user-select:none;";
      const catIcon = this._createOpenmojiImg(this._getCategoryIcon(cat), 16);
      catIcon.style.filter = "grayscale(100%) opacity(0.6)";
      header.appendChild(catIcon);
      const catName = document.createElement("div");
      catName.style.cssText = "font-weight:500;font-size:12px;flex:1;color:#bbb;";
      catName.textContent = this._getCategoryName(cat);
      header.appendChild(catName);
      const count = document.createElement("div");
      count.className = "sl-count";
      count.style.cssText = "font-size:11px;color:#ccc;font-weight:400;";
      count.textContent = fullCatTexts.length;
      header.appendChild(count);
      const chevron = document.createElement("ha-icon");
      chevron.setAttribute("icon", "mdi:chevron-down");
      chevron.style.cssText = "color:#ddd;width:16px;height:16px;";
      header.appendChild(chevron);
      catWrap.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "sl-grid";
      grid.className = "sl-grid";
      grid.style.cssText = "gap:8px;padding:8px;transition:max-height 0.3s ease;";
      let collapsed = false;
      header.addEventListener("click", () => {
        collapsed = !collapsed;
        grid.style.display = collapsed ? "none" : "grid";
        grid.dataset.collapsed = collapsed ? "true" : "";
        chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
      });

      for (const text of catTexts) {
        const existing = items.find(i => i.summary.toLowerCase() === text.toLowerCase());
        if (existing) {
          const tile = this._renderTile(existing, list.entity, color);
          tile.dataset.section = "mirror";
          grid.appendChild(tile);
        } else {
          grid.appendChild(this._renderGhostTile(text, list.entity, color));
        }
      }

      if (isLimited) {
        const loadMore = document.createElement("div");
        loadMore.style.cssText = "display:flex;align-items:center;justify-content:center;padding:8px;border-radius:12px;background:#fafafa;border:1px dashed #ccc;cursor:pointer;margin-top:4px;grid-column:1 / -1;transition:all 0.15s;";
        loadMore.textContent = "Mehr laden (" + (fullCatTexts.length - catTexts.length) + ")";
        loadMore.style.fontSize = "12px";
        loadMore.style.color = "#999";
        loadMore.addEventListener("mouseenter", () => { loadMore.style.background = "#e8f5e9"; loadMore.style.borderColor = color; });
        loadMore.addEventListener("mouseleave", () => { loadMore.style.background = "#fafafa"; loadMore.style.borderColor = "#ccc"; });
        let expanded = false;
        loadMore.addEventListener("click", () => {
          if (expanded) return;
          expanded = true;
          loadMore.remove();
          for (let i = maxPerCat; i < fullCatTexts.length; i++) {
            const text = fullCatTexts[i];
            const existing = items.find(it => it.summary.toLowerCase() === text.toLowerCase());
            if (existing) {
              const tile = this._renderTile(existing, list.entity, color);
              tile.dataset.section = "mirror";
              grid.appendChild(tile);
            } else {
              grid.appendChild(this._renderGhostTile(text, list.entity, color));
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
      showAll.style.cssText = "display:flex;align-items:center;justify-content:center;padding:10px;border-radius:12px;background:#fafafa;border:1px dashed #ccc;cursor:pointer;margin-top:8px;transition:all 0.15s;";
      showAll.textContent = "Alle Artikel anzeigen";
      showAll.style.fontSize = "13px";
      showAll.style.color = "#666";
      showAll.addEventListener("mouseenter", () => { showAll.style.background = "#e8f5e9"; showAll.style.borderColor = color; });
      showAll.addEventListener("mouseleave", () => { showAll.style.background = "#fafafa"; showAll.style.borderColor = "#ccc"; });
      showAll.addEventListener("click", () => {
        const newMirror = this._renderMirrorSection(list, items, color, order, Infinity);
        if (newMirror) mirrorWrap.replaceWith(newMirror);
      });
      mirrorWrap.appendChild(showAll);
    }

    return mirrorWrap;
  }

  _render() {
    const currentSummaries = [];
    for (const list of this.config.lists) {
      const items = this._itemsByList[list.entity] || [];
      for (const item of items) currentSummaries.push(list.entity + "|" + item.uid + "|" + item.summary + "|" + (item.description || "") + "|" + item.status);
    }
    currentSummaries.sort();
    const structHash = currentSummaries.join(";");

    const existingCard = this.querySelector("ha-card");
    if (existingCard && structHash === this._lastStructHash) {
      let sectionChanged = false;
      for (const list of this.config.lists) {
        const items = this._itemsByList[list.entity] || [];
        const itemMap = new Map();
        for (const item of items) itemMap.set(item.uid, item);
        const tiles = existingCard.querySelectorAll(`[data-entity="${list.entity}"].sl-tile:not(.sl-ghost)`);
        for (const tile of tiles) {
          const item = itemMap.get(tile.dataset.uid);
          if (!item) continue;
          const expected = item.status === "needs_action" ? "active" : "mirror";
          if (tile.dataset.section !== expected) { sectionChanged = true; break; }
        }
        if (sectionChanged) break;
      }
      if (!sectionChanged) {
        this._lightUpdate();
        return;
      }
    }
    this._lastStructHash = structHash;

    const card = document.createElement("ha-card");
    card.style.cssText = "padding:12px;display:block;";
    const style = document.createElement("style");
    style.textContent = `
      @keyframes sl-spin{to{transform:rotate(360deg)}}
      .sl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:12px;padding:12px;}
      @media (max-width:400px){.sl-grid{grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;padding:8px;}}
      @media (max-width:320px){.sl-grid{grid-template-columns:repeat(3,1fr);gap:6px;padding:6px;}}
    `;
    card.appendChild(style);

    for (const list of this.config.lists) {
      const items = this._itemsByList[list.entity] || [];
      const color = list.color || "#43A047";

      const listWrap = this._renderSearchBar(list);
      card.appendChild(listWrap);

      const groups = {};
      for (const item of items) {
        const cat = this._getItemCategory(item.summary);
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      }

      const order = ["obst_gemuese","brot_backwaren","milch_eier","fleisch_fisch","trockenwaren","tiefkuehlprodukte","getraenke","haushalt_hygiene","sonstiges"].filter(k => groups[k]?.length > 0);
      for (const k of Object.keys(groups)) if (!order.includes(k)) order.push(k);

      const activeOrder = order.filter(k => groups[k].some(i => i.status === "needs_action"));

      // Render first 2 categories immediately, rest lazy
      const immediateCats = activeOrder.slice(0, 2);
      const lazyCats = activeOrder.slice(2);

      for (const cat of immediateCats) {
        const catItems = groups[cat].filter(i => i.status === "needs_action");
        card.appendChild(this._renderCategory(cat, catItems, list, color));
      }

      // Lazy-load remaining categories + mirror
      if (lazyCats.length || items.length > 0) {
        const lazyContainer = document.createElement("div");
        lazyContainer.className = "sl-lazy-container";
        card.appendChild(lazyContainer);

        requestAnimationFrame(() => {
          if (!this.isConnected) return;
          const frag = document.createDocumentFragment();
          for (const cat of lazyCats) {
            const catItems = groups[cat].filter(i => i.status === "needs_action");
            frag.appendChild(this._renderCategory(cat, catItems, list, color));
          }
          const mirror = this._renderMirrorSection(list, items, color, order);
          if (mirror) frag.appendChild(mirror);

          // Replace placeholder with actual content
          const placeholder = card.querySelector(".sl-lazy-container");
          if (placeholder) {
            placeholder.replaceWith(frag);
          } else {
            card.appendChild(frag);
          }
        });
      }
    }
    this.replaceChildren(card);
  }

  _renderTile(item, entityId, color) {
    const isDone = item.status === "completed";
    const tile = document.createElement("div");
    tile.className = "sl-tile";
    tile.dataset.uid = item.uid;
    tile.dataset.summary = item.summary.toLowerCase();
    tile.dataset.entity = entityId;
    tile.dataset.status = item.status;
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:" + (isDone ? "#e0e0e0" : color) + ";border:" + (isDone ? "2px solid #bbb" : "none") + ";opacity:" + (isDone ? "0.55" : "1") + ";cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;-webkit-touch-callout:none;-webkit-user-select:none;touch-action:manipulation;";
    tile.addEventListener("mouseenter", () => { if (tile.dataset.status !== "completed") tile.style.background = "#388E3C"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = tile.dataset.status === "completed" ? "#e0e0e0" : color; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    this._renderItemIcon(iconWrap, item, 36);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.className = "sl-label";
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:" + (isDone ? "#999" : "#fff") + ";text-decoration:" + (isDone ? "line-through" : "none") + ";max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = item.summary;
    tile.appendChild(label);

    if (item.description) {
      const { text: descText } = this._parseDescription(item.description);
      if (descText) {
        const badge = document.createElement("div");
        badge.className = "sl-badge";
        badge.style.cssText = "display:inline-block;padding:2px 6px;border-radius:8px;background:" + (isDone ? "#ccc" : "rgba(255,255,255,0.25)") + ";color:" + (isDone ? "#666" : "#fff") + ";font-size:9px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;";
        badge.textContent = descText;
        tile.appendChild(badge);
      }
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
      const items = this._itemsByList[entityId] || [];
      const currentItem = items.find(i => i.uid === tile.dataset.uid);
      if (currentItem) this._showEditModal(currentItem, entityId);
    };
    const startPress = () => {
      longPressFired = false;
      pressTimer = setTimeout(() => {
        pressTimer = null;
        fireLongPress();
      }, 500);
    };
    const endPress = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    };
    tile.addEventListener("touchstart", e => {
      touchHandled = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      startPress();
    }, { passive: true });
    tile.addEventListener("touchend", () => { endPress(); setTimeout(() => touchHandled = false, 300); });
    tile.addEventListener("touchmove", e => {
      if (pressTimer) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) endPress();
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
      if (!longPressFired) {
        const items = this._itemsByList[entityId] || [];
        const currentItem = items.find(i => i.uid === tile.dataset.uid);
        if (currentItem) this._toggleItem(entityId, currentItem);
      }
    });
    return tile;
  }

  _renderGhostTile(text, entityId, color) {
    const tile = document.createElement("div");
    tile.className = "sl-tile sl-ghost";
    tile.dataset.summary = text.toLowerCase();
    tile.dataset.entity = entityId;
    tile.dataset.status = "ghost";
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:#f5f5f5;border:2px dashed #ddd;opacity:0.65;cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;-webkit-touch-callout:none;-webkit-user-select:none;touch-action:manipulation;";
    tile.addEventListener("mouseenter", () => { tile.style.background = "#e8f5e9"; tile.style.borderColor = color; tile.style.opacity = "0.9"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = "#f5f5f5"; tile.style.borderColor = "#ddd"; tile.style.opacity = "0.65"; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    this._renderItemIcon(iconWrap, { summary: text, description: null }, 36);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.className = "sl-label";
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:#999;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = text;
    tile.appendChild(label);

    tile.addEventListener("click", () => this._addItem(entityId, text));
    return tile;
  }

  _showEditModal(item, entityId) {
    const existing = document.querySelector(".shopping-list-modal");
    existing && existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "shopping-list-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
    overlay.dataset.itemUid = item.uid;
    overlay.dataset.itemEntity = entityId;
    const box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:16px;padding:20px;width:min(300px,92vw);max-width:92vw;box-shadow:0 4px 20px rgba(0,0,0,0.3);box-sizing:border-box;";

    const title = document.createElement("div");
    title.className = "sl-modal-title";
    title.style.cssText = "font-size:17px;font-weight:600;margin-bottom:12px;color:#2e7d32;";
    title.textContent = item.summary;
    box.appendChild(title);

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:13px;color:#666;margin-bottom:8px;";
    hint.textContent = "Anmerkungen";
    box.appendChild(hint);

    const quickWrap = document.createElement("div");
    quickWrap.style.cssText = "display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;";
    for (const qty of ["1x", "2x", "5x", "10x"]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "+" + qty;
      btn.style.cssText = "padding:6px 12px;border-radius:16px;border:1px solid #c8e6c9;background:#e8f5e9;color:#2e7d32;font-size:13px;font-weight:600;cursor:pointer;transition:all 0.1s;";
      btn.addEventListener("mouseenter", () => { btn.style.background = "#c8e6c9"; });
      btn.addEventListener("mouseleave", () => { btn.style.background = "#e8f5e9"; });
      btn.addEventListener("click", () => {
        const val = descInput.value.trim();
        const addNum = parseInt(qty.replace("x", ""), 10);
        const existingMatch = val.match(/^(\d+)x?\s*(.*)$/);
        if (existingMatch) {
          const currentNum = parseInt(existingMatch[1], 10);
          const rest = existingMatch[2];
          descInput.value = (currentNum + addNum) + "x" + (rest ? " " + rest : "");
        } else if (!val) {
          descInput.value = qty;
        } else {
          descInput.value = qty + " " + val;
        }
        descInput.focus();
      });
      quickWrap.appendChild(btn);
    }
    box.appendChild(quickWrap);

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "margin-bottom:12px;position:relative;";
    const iconLabel = document.createElement("div");
    iconLabel.style.cssText = "font-size:13px;color:#666;margin-bottom:4px;display:flex;align-items:center;gap:6px;";
    iconLabel.textContent = "MDI Icon (optional)";
    iconWrap.appendChild(iconLabel);

    const { icon: existingIcon, text: existingText } = this._parseDescription(item.description);

    const iconRow = document.createElement("div");
    iconRow.style.cssText = "display:flex;align-items:center;gap:8px;";
    const iconInput = document.createElement("input");
    iconInput.type = "text";
    iconInput.placeholder = "mdi:food-apple";
    iconInput.value = existingIcon || "";
    iconInput.style.cssText = "flex:1;padding:10px;border-radius:8px;border:1px solid #c8e6c9;background:#f1f8e9;color:#333;font-size:15px;outline:none;box-sizing:border-box;";
    const iconPreview = document.createElement("ha-icon");
    iconPreview.style.cssText = "width:28px;height:28px;color:#666;flex-shrink:0;";
    const updatePreview = () => {
      const val = iconInput.value.trim();
      if (val && val.startsWith("mdi:")) {
        iconPreview.setAttribute("icon", val);
        iconPreview.style.color = "#333";
      } else {
        iconPreview.setAttribute("icon", "mdi:image-off");
        iconPreview.style.color = "#ccc";
      }
    };
    updatePreview();
    iconInput.addEventListener("input", updatePreview);
    iconRow.appendChild(iconInput);
    iconRow.appendChild(iconPreview);
    iconWrap.appendChild(iconRow);

    const iconClear = document.createElement("div");
    iconClear.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;margin-top:4px;text-align:right;";
    iconClear.textContent = "Icon entfernen";
    iconClear.addEventListener("click", () => {
      iconInput.value = "";
      updatePreview();
      iconDropdown.style.display = "none";
    });
    iconWrap.appendChild(iconClear);
    box.appendChild(iconWrap);

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.value = existingText || "";
    descInput.style.cssText = "width:100%;padding:10px;border-radius:8px;border:1px solid #c8e6c9;background:#f1f8e9;color:#333;font-size:15px;outline:none;margin-bottom:16px;box-sizing:border-box;";
    box.appendChild(descInput);

    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;";

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "Speichern";
    saveBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:none;background:#43A047;color:#fff;font-size:15px;font-weight:600;cursor:pointer;";
    saveBtn.addEventListener("click", () => {
      const mdiVal = iconInput.value.trim();
      const descVal = descInput.value.trim();
      const fullDesc = mdiVal && mdiVal.startsWith("mdi:") ? `[${mdiVal}] ${descVal}` : descVal;
      this._updateDescription(entityId, item, fullDesc);
      const items = this._itemsByList[entityId] || [];
      const cached = items.find(i => i.uid === item.uid);
      if (cached) cached.description = fullDesc;
      this._lastStructHash = "";
      overlay.remove();
      setTimeout(() => this._fetchAndRender(), 500);
    });
    btns.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Abbrechen";
    cancelBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:1px solid #c8e6c9;background:transparent;color:#333;font-size:15px;cursor:pointer;";
    cancelBtn.addEventListener("click", () => overlay.remove());
    btns.appendChild(cancelBtn);
    box.appendChild(btns);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Löschen";
    delBtn.style.cssText = "width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid #ef5350;background:transparent;color:#ef5350;font-size:13px;cursor:pointer;";
    delBtn.addEventListener("click", () => { this._removeItem(entityId, item); overlay.remove(); });
    box.appendChild(delBtn);

    overlay.appendChild(box);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    descInput.focus();
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", required: true, selector: { text: {} } },
        { name: "entity", selector: { entity: { domain: "todo" } } }
      ]
    };
  }

  static getStubConfig() {
    return { title: "Einkaufen", entity: "todo.einkaufen" };
  }

  getCardSize() { return 4; }
}

customElements.define("shopping-list-card", ShoppingListCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "shopping-list-card",
  name: "Shopping List",
  description: "Multi-list shopping card with todo integration",
  preview: true
});
