class ShoppingListCard extends HTMLElement {
  constructor() {
    super();
    this._itemsByList = {};
    this._unsub = null;
    this._debounceTimer = null;
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
    if (this._hass) this._fetchAndRender();
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
    }, 100);
  }

  async _updateItems(hass) {
    if (!hass || !this.config?.lists) return;
    for (const list of this.config.lists) {
      const entityId = list.entity;
      try {
        const state = hass.states[entityId];
        if (state?.attributes?.todo_items) {
          this._itemsByList[entityId] = state.attributes.todo_items;
          continue;
        }
        const res = await hass.callWS({
          type: "call_service",
          domain: "todo",
          service: "get_items",
          service_data: { entity_id: entityId, status: ["needs_action", "completed"] },
          return_response: !0
        });
        const resp = res?.result?.response || res?.response;
        const items = resp?.[entityId]?.items || [];
        this._itemsByList[entityId] = items;
      } catch (e) {
        console.warn("Shopping List Card: Failed to fetch items for", entityId, e);
        this._itemsByList[entityId] = [];
      }
    }
  }

  _shouldRender(oldHass, newHass) {
    if (!this.config?.lists) return !1;
    for (const list of this.config.lists) {
      const id = list.entity;
      const oldState = oldHass.states[id];
      const newState = newHass.states[id];
      if (!oldState || !newState) return !0;
      if (oldState.last_changed !== newState.last_changed) return !0;
      if (oldState.last_updated !== newState.last_updated) return !0;
      const oldItems = oldState.attributes?.todo_items;
      const newItems = newState.attributes?.todo_items;
      if (oldItems?.length !== newItems?.length) return !0;
      if ((oldItems?.length || 0) > 0 && (newItems?.length || 0) > 0) {
        const oldLast = oldItems[oldItems.length - 1].last_updated || 0;
        const newLast = newItems[newItems.length - 1].last_updated || 0;
        if (oldLast !== newLast) return !0;
      }
    }
    return !1;
  }

  _filterVisible(listWrap, query) {
    const card = listWrap.parentElement;
    const cats = card.querySelectorAll(".sl-cat");
    for (const cat of cats) {
      const tiles = cat.querySelectorAll("[data-summary]");
      let visible = 0;
      for (const tile of tiles) {
        const match = !query || tile.dataset.summary.includes(query);
        tile.style.display = match ? "" : "none";
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

    const iconMap = {
      "eier": "1F95A", "ei": "1F95A",
      "apfel": "1F34E", "äpfel": "1F34E",
      "banane": "1F34C", "bananen": "1F34C",
      "birne": "1F350", "birnen": "1F350",
      "kiwi": "1F95D",
      "orange": "1F34A", "orangen": "1F34A",
      "mandarine": "1F34A",
      "traube": "1F347", "trauben": "1F347",
      "kirsche": "1F352", "kirschen": "1F352",
      "erdbeere": "1F353", "erdbeeren": "1F353",
      "himbeere": "1F353", "himbeeren": "1F353",
      "heidelbeere": "1FAD0", "heidelbeeren": "1FAD0",
      "pfirsich": "1F351", "pflaume": "1F351",
      "zitrone": "1F34B", "limette": "1F34B",
      "grapefruit": "1F34A",
      "melone": "1F348",
      "ananas": "1F34D",
      "mango": "1F96D",
      "avocado": "1F951",
      "tomate": "1F345", "tomaten": "1F345",
      "gurke": "1F952",
      "paprika": "1FAD1",
      "karotte": "1F955", "karotten": "1F955",
      "zucchini": "1F955",
      "aubergine": "1F346",
      "brokkoli": "1F966", "blumenkohl": "1F966",
      "spinat": "1F96C", "blattspinat": "1F96C",
      "salat": "1F96C",
      "kartoffel": "1F954", "kartoffeln": "1F954",
      "zwiebel": "1F9C5", "zwiebeln": "1F9C5",
      "knoblauch": "1F9C4",
      "lauch": "1F96C", "schnittlauch": "1F96C",
      "frühlingszwiebel": "1F9C5", "schalotte": "1F9C5",
      "radieschen": "1F955",
      "sellerie": "1F96C",
      "rote bete": "1F345", "rotebete": "1F345",
      "pilz": "1F344", "champignon": "1F344", "pfifferling": "1F344",
      "steinpilz": "1F344", "kräuterseitling": "1F344", "austernpilz": "1F344",
      "pilze": "1F344",
      "gemüse": "1F955",
      "obst": "1F353", "frucht": "1F353",
      "brot": "1F35E", "brötchen": "1F35E",
      "toast": "1F35E", "semmel": "1F35E",
      "baguette": "1F35E", "ciabatta": "1F35E",
      "croissant": "1F950", "schrippe": "1F35E",
      "weckle": "1F35E", "laugenbrezel": "1F35E", "brezel": "1F35E",
      "milch": "1F95B", "joghurt": "1FAD9",
      "sahne": "1F95B", "schmand": "1F95B", "schlagsahne": "1F95B",
      "butter": "1F9C8",
      "käse": "1F9C0", "quark": "1FAD9",
      "frischkäse": "1F9C0", "mozzarella": "1F9C0",
      "brie": "1F9C0", "gouda": "1F9C0", "emmentaler": "1F9C0",
      "parmesan": "1F9C0", "cream cheese": "1F9C0", "mascarpone": "1F9C0",
      "burrata": "1F9C0", "cheddar": "1F9C0",
      "fleisch": "1F969", "steak": "1F969",
      "hähnchen": "1F357", "pute": "1F357", "ente": "1F357",
      "schinken": "1F953", "speck": "1F953",
      "wurst": "1F354", "salami": "1F354", "mettwurst": "1F354",
      "schnitzel": "1F357", "hackfleisch": "1F969",
      "fisch": "1F41F", "lachs": "1F41F", "thunfisch": "1F41F",
      "forelle": "1F41F", "scholle": "1F41F", "makrele": "1F41F",
      "garnelen": "1F990", "krabben": "1F990",
      "tofu": "1F96C", "seitan": "1F969",
      "vegan": "1F96C", "vegetarisch": "1F96C",
      "nudeln": "1F35D", "spaghetti": "1F35D",
      "penne": "1F35D", "rigatoni": "1F35D",
      "fettuccine": "1F35D", "lasagne": "1F35D",
      "reis": "1F35A", "couscous": "1F35A", "bulgur": "1F35A",
      "mehl": "1F33E",
      "zucker": "1F36C", "salz": "1F9C2", "pfeffer": "1F336",
      "öl": "1F6E2", "olivenöl": "1F6E2",
      "essig": "1F9C2",
      "soße": "1F963", "ketchup": "1F345",
      "mayo": "1F9C2", "mayonnaise": "1F9C2", "senf": "1F336",
      "gewürz": "1F336", "gewürze": "1F336",
      "kräuter": "1F33F", "vanille": "1F33F", "zimt": "1F33F",
      "honig": "1F36F",
      "marmelade": "1F36F", "nutella": "1F36F", "aufstrich": "1F36F",
      "kapern": "1F952", "oliven": "1F95C",
      "essiggurke": "1F952", "sauerkraut": "1F96C",
      "peperoni": "1F336", "antipasti": "1F952",
      "kaffee": "2615", "espresso": "2615", "cappuccino": "2615",
      "tee": "1FAD6",
      "bier": "1F37A", "wein": "1F377",
      "weißwein": "1F377", "rotwein": "1F377",
      "wasser": "1F4A7", "getränke": "1F964",
      "cola": "1F964", "limonade": "1F964",
      "sprite": "1F964", "fanta": "1F964", "apfelschorle": "1F964",
      "saft": "1F9C3", "orangensaft": "1F9C3",
      "kapseln": "2615", "kakao": "2615",
      "tiefkühl": "2744", "tiefkühlpizza": "1F355",
      "pizza": "1F355", "frikassee": "1F963",
      "fischstäbchen": "1F41F", "pommes": "1F35F",
      "eis": "1F366", "eiskrem": "1F366",
      "toilettenpapier": "1F9FB", "küchenrolle": "1F9FB",
      "papier": "1F4C4", "taschentuch": "1F9FB",
      "waschmittel": "1F9FC", "spülmittel": "1FAE7", "spüli": "1FAE7",
      "zahnpasta": "1FAE5", "zahnbürste": "1FAE5",
      "shampoo": "1F9FC", "duschgel": "1F9FC",
      "seife": "1F9FC",
      "deodorant": "1F9F4", "rasierer": "1FA92",
      "dusch": "1F6BF", "bad": "1F6BF",
      "weichspüler": "1F9FC", "reiniger": "1F9F9", "tabs": "1F9FC",
      "schokolade": "1F36B", "kekse": "1F36A",
      "chips": "1F35F", "nüsse": "1F330", "mandeln": "1F330",
      "müllbeutel": "1F5D1",
      "aprikose": "1F351", "brombeeren": "1F347",
      "clementine": "1F34A", "klementine": "1F34A",
      "cranberry": "1F347", "datteln": "1F36C", "feige": "1F34A",
      "granatapfel": "1F347", "johannisbeeren": "1F353",
      "nektarine": "1F351", "pampelmuse": "1F34A",
      "preiselbeeren": "1F353", "stachelbeeren": "1F353",
      "wassermelone": "1F349",
      "chinakohl": "1F96C", "eisbergsalat": "1F96C", "feldsalat": "1F96C",
      "kürbis": "1F383", "lauch": "1F96C", "mais": "1F33D",
      "mangold": "1F96C", "pak choi": "1F96C", "pastinake": "1F955",
      "petersilie": "1F33F", "porree": "1F96C", "rettich": "1F955",
      "rosenkohl": "1F966", "rotkohl": "1F966", "rucola": "1F96C",
      "spargel": "1F966", "süßkartoffel": "1F360", "topinambur": "1F954",
      "weißkohl": "1F966",
      "buttermilch": "1F95B", "camembert": "1F9C0", "creme fraiche": "1F95B",
      "feta": "1F9C0", "griechischer joghurt": "1FAD9", "kefir": "1F95B",
      "kochkäse": "1F9C0", "leerdammer": "1F9C0", "milchreis": "1F35A",
      "ricotta": "1F9C0",
      "calamari": "1F991", "ente": "1F357", "hähnchenbrust": "1F357",
      "hähnchenkeule": "1F357", "kalbfleisch": "1F969", "kassler": "1F953",
      "lamm": "1F411", "leber": "1F969", "lunge": "1F969",
      "putenbrust": "1F357", "putenschnitzel": "1F357", "rinderfilet": "1F969",
      "rinderhack": "1F969", "rinderroulade": "1F969", "rollmops": "1F41F",
      "sülze": "1F963", "zander": "1F41F",
      "backpulver": "1F9C2", "balsamico": "1F9C2", "brühe": "1F963",
      "gnocchi": "1F35D", "haferflocken": "1F33E", "kartoffelstärke": "1F33E",
      "kichererbsen": "1F96C", "kidneybohnen": "1F96C", "linsen": "1F96C",
      "paniermehl": "1F33E", "pesto": "1F33F", "polenta": "1F35A",
      "rosinen": "1F347", "sahnesteif": "1F9C2", "sojasoße": "1F963",
      "sonnenblumenöl": "1F6E2", "soßenbinder": "1F9C2",
      "vanillezucker": "1F36C", "worcestersauce": "1F9C2",
      "apfelschorle": "1F964", "energydrink": "1F964", "granatapfelsaft": "1F9C3",
      "hugo": "1F377", "mineralwasser": "1F4A7", "prosecco": "1F377",
      "radler": "1F37A", "sekt": "1F37E", "smoothie": "1F964",
      "sprudelwasser": "1F4A7", "traubensaft": "1F9C3",
      "aufbackbrötchen": "1F35E", "blätterteig": "1F35E", "gemüsepfanne": "1F966",
      "knödel": "1F35D", "kuchen": "1F370", "lasagne": "1F35D",
      "maultaschen": "1F35D", "nuggets": "1F357", "paniertes": "1F357",
      "piroggen": "1F35D", "ravioli": "1F35D", "reibekuchen": "1F35F",
      "schaschlik": "1F357", "tortellini": "1F35D", "waffeln": "1F367",
      "wraps": "1F35D",
      "abwaschbürste": "1FAE7", "alufolie": "1F4E6", "backpapier": "1F4C4",
      "bonbons": "1F36C", "deo": "1F9F4", "desinfektionsmittel": "1F9F9",
      "drano": "1F9F9", "feuchttücher": "1F9FB", "frischhaltefolie": "1F4E6",
      "geschirrtabs": "1F9FC", "glühbirne": "1F4A1", "haargel": "1F9FC",
      "handcreme": "1F9F5", "handschuhe": "1F9E4", "hustensaft": "1F9EA",
      "insektenspray": "1F9F4", "kerze": "1F56F", "kerzen": "1F56F",
      "klorollen": "1F9FB", "kondome": "1F9F4", "körperöl": "1F9F7",
      "küchentücher": "1F9FB", "leinöl": "1F6E2", "lotion": "1F9F5",
      "lufterfrischer": "1F33F", "make-up": "1F484", "mascara": "1F484",
      "medikamente": "1F48A", "milchreiniger": "1F9FC", "mülltüten": "1F5D1",
      "mundspülung": "1F9F4", "nasenspray": "1F9EA", "orangenschalen": "1F34A",
      "papiertüten": "1F4E6", "parfüm": "1F484", "pfefferkörner": "1F336",
      "pflaster": "1F48A", "rasierklingen": "1FA92", "rasierschaum": "1FAE6",
      "räucherstäbchen": "1F56F", "salbei": "1F33F", "spülbürste": "1FAE7",
      "staubsaugerbeutel": "1F9F9", "streichhölzer": "1F522",
      "taschentücher": "1F9FB", "teebaumöl": "1F33F",
      "toilettenreiniger": "1F9F9", "zahnbürste": "1FAE5",
      "zitronenmelisse": "1F34B", "zündhölzer": "1F522",
      "bubblegum": "1F36C", "gummibärchen": "1F36C", "kaugummi": "1F36C",
      "knuspermüsli": "1F33E", "lebkuchen": "1F36A", "lutscher": "1F36D",
      "marshmallow": "1F36C", "nougat": "1F36B", "pralinen": "1F36B",
      "salzstangen": "1F35F", "studentenfutter": "1F330", "trockenobst": "1F347",
      "weinbrand": "1F377"
    };

    for (const [key, hex] of Object.entries(iconMap)) {
      if (t.includes(key)) return hex;
    }
    return "1F6D2";
  }

  _getItemCategory(text) {
    const t = text.toLowerCase();
    const cats = [
      { key: "obst_gemuese", keys: ["apfel","banane","birne","kiwi","orange","mandarine","traube","kirsche","erdbeere","himbeere","heidelbeere","pfirsich","pflaume","zitrone","limette","grapefruit","melone","ananas","mango","obst","frucht","tomate","tomaten","gurke","paprika","karotte","karotten","zucchini","aubergine","brokkoli","blumenkohl","spinat","blattspinat","salat","kartoffel","kartoffeln","zwiebel","zwiebeln","knoblauch","lauch","schnittlauch","frühlingszwiebel","schalotte","radieschen","sellerie","rote bete","rotebete","pilz","champignon","pfifferling","steinpilz","kräuterseitling","austernpilz","pilze","gemüse","avocado","aprikose","brombeeren","clementine","klementine","cranberry","datteln","feige","granatapfel","johannisbeeren","nektarine","pampelmuse","preiselbeeren","stachelbeeren","wassermelone","chinakohl","eisbergsalat","feldsalat","kürbis","mais","mangold","pak choi","pastinake","petersilie","porree","rettich","rosenkohl","rotkohl","rucola","spargel","süßkartoffel","topinambur","weißkohl"] },
      { key: "brot_backwaren", keys: ["brot","brötchen","toast","semmel","baguette","ciabatta","croissant","schrippe","weckle","laugenbrezel","brezel","aufbackbrötchen","blätterteig","kuchen","lasagne","maultaschen","nuggets","paniertes","piroggen","ravioli","reibekuchen","tortellini","waffeln","wraps"] },
      { key: "milch_eier", keys: ["milch","joghurt","sahne","schmand","schlagsahne","butter","käse","quark","frischkäse","mozzarella","brie","gouda","emmentaler","parmesan","cream cheese","mascarpone","eier","ei","burrata","cheddar","buttermilch","camembert","creme fraiche","feta","griechischer joghurt","kefir","kochkäse","leerdammer","milchreis","ricotta"] },
      { key: "fleisch_fisch", keys: ["fleisch","steak","hähnchen","pute","ente","schinken","speck","wurst","schnitzel","hackfleisch","salami","mettwurst","fisch","lachs","thunfisch","forelle","garnelen","krabben","scholle","makrele","tofu","seitan","vegan","vegetarisch","calamari","hähnchenbrust","hähnchenkeule","kalbfleisch","kassler","lamm","leber","lunge","putenbrust","putenschnitzel","rinderfilet","rinderhack","rinderroulade","rollmops","sülze","zander"] },
      { key: "trockenwaren", keys: ["nudeln","spaghetti","penne","rigatoni","fettuccine","lasagne","reis","couscous","bulgur","mehl","zucker","salz","pfeffer","öl","olivenöl","essig","soße","ketchup","mayo","mayonnaise","senf","gewürz","gewürze","kräuter","vanille","zimt","honig","marmelade","nutella","aufstrich","kapern","oliven","essiggurke","sauerkraut","peperoni","antipasti","backpulver","balsamico","brühe","gnocchi","haferflocken","kartoffelstärke","kichererbsen","kidneybohnen","linsen","paniermehl","pesto","polenta","rosinen","sahnesteif","sojasoße","sonnenblumenöl","soßenbinder","vanillezucker","worcestersauce"] },
      { key: "tiefkuehlprodukte", keys: ["tiefkühl","tiefkühlpizza","pizza","frikassee","fischstäbchen","pommes","eis","eiskrem","gemüsepfanne","knödel","nuggets","paniertes","piroggen","ravioli","reibekuchen","schaschlik","tortellini","waffeln"] },
      { key: "getraenke", keys: ["wasser","getränke","cola","saft","bier","wein","weißwein","rotwein","limonade","sprite","fanta","apfelschorle","kaffee","espresso","kapseln","kakao","tee","cappuccino","apfelschorle","energydrink","granatapfelsaft","hugo","mineralwasser","prosecco","radler","sekt","smoothie","sprudelwasser","traubensaft"] },
      { key: "haushalt_hygiene", keys: ["toilettenpapier","küchenrolle","papier","taschentuch","shampoo","duschgel","seife","zahnpasta","zahnbürste","deodorant","rasierer","dusch","bad","waschmittel","weichspüler","reiniger","spülmittel","tabs","spüli","abwaschbürste","alufolie","backpapier","bonbons","deo","desinfektionsmittel","drano","feuchttücher","frischhaltefolie","geschirrtabs","glühbirne","haargel","handcreme","handschuhe","hustensaft","insektenspray","kerze","kerzen","klorollen","kondome","körperöl","küchentücher","leinöl","lotion","lufterfrischer","make-up","mascara","medikamente","milchreiniger","mülltüten","mundspülung","nasenspray","orangenschalen","papiertüten","parfüm","pfefferkörner","pflaster","rasierklingen","rasierschaum","räucherstäbchen","salbei","spülbürste","staubsaugerbeutel","streichhölzer","taschentücher","teebaumöl","toilettenreiniger","zahnbürste","zitronenmelisse","zündhölzer"] }
    ];
    for (const cat of cats) {
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
      obst_gemuese: "#E67E22",
      brot_backwaren: "#D35400",
      milch_eier: "#F39C12",
      fleisch_fisch: "#E74C3C",
      trockenwaren: "#8E44AD",
      tiefkuehlprodukte: "#3498DB",
      getraenke: "#1ABC9C",
      haushalt_hygiene: "#9B59B6",
      sonstiges: "#7F8C8D"
    }[key] || "#7F8C8D";
  }

  _getAutocompleteItems() {
    const items = [
      "Apfel","Banane","Birne","Kiwi","Orange","Mandarine","Trauben","Kirschen","Erdbeeren","Himbeeren",
      "Pfirsich","Pflaume","Zitrone","Melone","Ananas","Mango","Avocado","Tomaten","Gurke","Paprika",
      "Karotten","Zucchini","Aubergine","Brokkoli","Blumenkohl","Spinat","Salat","Kartoffeln","Zwiebeln",
      "Knoblauch","Pilze","Champignons","Radieschen","Brot","Brötchen","Toast","Baguette","Croissants",
      "Milch","Joghurt","Sahne","Butter","Käse","Quark","Frischkäse","Mozzarella","Eier","Hähnchen",
      "Hackfleisch","Schnitzel","Wurst","Schinken","Fisch","Lachs","Garnelen","Tofu","Nudeln","Spaghetti",
      "Reis","Mehl","Zucker","Salz","Pfeffer","Olivenöl","Essig","Ketchup","Mayonnaise","Senf","Honig",
      "Marmelade","Tiefkühlpizza","Fischstäbchen","Pommes","Eis","Wasser","Saft","Cola","Bier","Wein",
      "Kaffee","Tee","Toilettenpapier","Küchenrolle","Shampoo","Duschgel","Seife","Zahnpasta","Waschmittel",
      "Weichspüler","Spülmittel","Schokolade","Kekse","Chips","Nüsse","Mandeln","TK-Gemüse","Müllbeutel",
      "Aprikose","Brombeeren","Clementine","Cranberry","Datteln","Feige","Granatapfel","Heidelbeeren",
      "Holunder","Johannisbeeren","Klementine","Mandarine","Nektarine","Pampelmuse","Preiselbeeren",
      "Rote Bete","Stachelbeeren","Wassermelone","Blattspinat","Chinakohl","Eisbergsalat","Feldsalat",
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
    ];
    return [...new Set(items)];
  }

  _itemExists(entityId, text) {
    const items = this._itemsByList[entityId] || [];
    return items.some(item => item.summary.toLowerCase() === text.toLowerCase());
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

  _addItem(entityId, text) {
    const val = text.trim();
    if (!val || !this._hass) return;
    if (this._itemExists(entityId, val)) {
      this._showToast("'" + val + "' ist bereits auf der Liste");
      this._haptic(30);
      return;
    }
    this._hass.callService("todo", "add_item", { entity_id: entityId, item: val });
    this._haptic(60);
  }

  _toggleItem(entityId, item) {
    if (!this._hass) return;
    const status = item.status === "completed" ? "needs_action" : "completed";
    this._hass.callService("todo", "update_item", { entity_id: entityId, item: item.summary, status: status });
    this._haptic(status === "needs_action" ? 40 : 60);
  }

  _removeItem(entityId, item) {
    if (!this._hass) return;
    this._hass.callService("todo", "remove_item", { entity_id: entityId, item: item.summary });
    this._haptic(40);
  }

  _clearDone(entityId) {
    if (!this._hass) return;
    this._hass.callService("todo", "remove_completed_items", { entity_id: entityId });
    this._haptic(80);
  }

  _updateDescription(entityId, item, desc) {
    if (!this._hass) return;
    this._hass.callService("todo", "update_item", { entity_id: entityId, item: item.summary, description: desc });
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

  _render() {
    this.innerHTML = "";
    const card = document.createElement("ha-card");
    card.style.cssText = "padding:12px;display:block;";

    for (const list of this.config.lists) {
      const items = this._itemsByList[list.entity] || [];
      const color = list.color || "#43A047";
      const listWrap = document.createElement("div");
      listWrap.style.cssText = "margin-bottom:14px;position:relative;";

      // Search bar
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
      addBtn.textContent = "+";
      addBtn.style.cssText = "background:transparent;color:#888;border:none;border-radius:50%;width:32px;height:32px;font-size:22px;font-weight:300;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;";
      searchWrap.appendChild(addBtn);
      listWrap.appendChild(searchWrap);

      // Autocomplete dropdown
      const acDropdown = document.createElement("div");
      acDropdown.style.cssText = "position:absolute;top:100%;left:0;right:0;background:#fff;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:100;max-height:200px;overflow-y:auto;display:none;";
      listWrap.appendChild(acDropdown);

      const acItems = this._getAutocompleteItems();
      input.addEventListener("input", () => {
        const val = input.value.toLowerCase().trim();
        acDropdown.innerHTML = "";
        this._filterVisible(listWrap, val);
        if (!val) { acDropdown.style.display = "none"; return; }
        const matches = acItems.filter(it => it.toLowerCase().includes(val) && !this._itemExists(list.entity, it)).slice(0, 8);
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
      input.addEventListener("blur", () => { setTimeout(() => { acDropdown.style.display = "none"; if (!input.value.trim()) this._filterVisible(listWrap, ""); }, 200); });
      input.addEventListener("focus", () => { if (input.value.trim()) input.dispatchEvent(new Event("input")); });
      card.appendChild(listWrap);

      // Group by category
      const groups = {};
      for (const item of items) {
        const cat = this._getItemCategory(item.summary);
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(item);
      }

      const order = ["obst_gemuese","brot_backwaren","milch_eier","fleisch_fisch","trockenwaren","tiefkuehlprodukte","getraenke","haushalt_hygiene","sonstiges"].filter(k => groups[k]?.length > 0);
      for (const k of Object.keys(groups)) if (!order.includes(k)) order.push(k);

      // --- Active categories (needs_action only) ---
      const activeOrder = order.filter(k => groups[k].some(i => i.status === "needs_action"));
      for (const cat of activeOrder) {
        const catItems = groups[cat].filter(i => i.status === "needs_action");
        const catWrap = document.createElement("div");
        catWrap.className = "sl-cat";
        catWrap.style.marginBottom = "16px";

        // Category header
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
        count.style.cssText = "font-size:12px;color:#999;font-weight:400;";
        count.textContent = catItems.length;
        header.appendChild(count);
        const chevron = document.createElement("ha-icon");
        chevron.setAttribute("icon", "mdi:chevron-down");
        chevron.style.cssText = "color:#bbb;width:18px;height:18px;";
        header.appendChild(chevron);
        catWrap.appendChild(header);

        // Grid
        const grid = document.createElement("div");
        grid.className = "sl-grid";
        grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:12px;padding:12px;transition:max-height 0.3s ease;";
        let collapsed = !1;
        header.addEventListener("click", () => {
          collapsed = !collapsed;
          grid.style.display = collapsed ? "none" : "grid";
          grid.dataset.collapsed = collapsed ? "true" : "";
          chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
        });

        for (const item of catItems) grid.appendChild(this._renderTile(item, list.entity, color));

        // Add tile
        const addTile = document.createElement("div");
        addTile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px;border-radius:12px;border:2px dashed " + color + "60;background:#fff;cursor:pointer;min-height:72px;transition:all 0.15s;position:relative;";
        const plusIcon = document.createElement("ha-icon");
        plusIcon.setAttribute("icon", "mdi:plus");
        plusIcon.style.cssText = "color:" + color + ";width:22px;height:22px;";
        addTile.appendChild(plusIcon);
        addTile.addEventListener("mouseenter", () => { addTile.style.background = "#e8f5e9"; addTile.style.borderColor = color; });
        addTile.addEventListener("mouseleave", () => { addTile.style.background = "#fff"; addTile.style.borderColor = color + "60"; });
        let tileInput = null;
        addTile.addEventListener("click", () => {
          if (!tileInput) {
            addTile.innerHTML = "";
            const tileAc = document.createElement("div");
            tileAc.style.cssText = "position:absolute;top:100%;left:-25px;width:150px;background:#fff;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:200;max-height:160px;overflow-y:auto;display:none;";
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
              const matches = allItems.filter(it => it.toLowerCase().includes(v) && !this._itemExists(list.entity, it)).slice(0, 6);
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
            tileInput.addEventListener("blur", () => { setTimeout(() => tileInput && resetTile(), 300); });
            addTile.appendChild(tileInput);
            addTile.appendChild(tileAc);
            tileInput.focus();
          }
        });
        grid.appendChild(addTile);
        catWrap.appendChild(grid);
        card.appendChild(catWrap);
      }

      // --- Completed / Available mirror section ---
      const onListSummaries = new Set(items.map(i => i.summary.toLowerCase()));
      const allArticles = this._getAutocompleteItems();
      const availByCat = {};
      let totalAvail = 0;
      for (const text of allArticles) {
        if (onListSummaries.has(text.toLowerCase())) continue;
        const cat = this._getItemCategory(text);
        if (!availByCat[cat]) availByCat[cat] = [];
        availByCat[cat].push(text);
        totalAvail++;
      }
      if (totalAvail > 0) {
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
        mt.textContent = "Verfügbar (" + totalAvail + ")";
        mirrorTitle.appendChild(mt);
        const clearAll = document.createElement("div");
        clearAll.textContent = "erledigte löschen";
        clearAll.style.cssText = "font-size:11px;color:#aaa;cursor:pointer;";
        clearAll.addEventListener("click", () => this._clearDone(list.entity));
        mirrorTitle.appendChild(clearAll);
        mirrorWrap.appendChild(mirrorTitle);

        for (const cat of order) {
          if (!availByCat[cat]) continue;
          const catTexts = availByCat[cat];
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
          count.style.cssText = "font-size:11px;color:#ccc;font-weight:400;";
          count.textContent = catTexts.length;
          header.appendChild(count);
          const chevron = document.createElement("ha-icon");
          chevron.setAttribute("icon", "mdi:chevron-down");
          chevron.style.cssText = "color:#ddd;width:16px;height:16px;";
          header.appendChild(chevron);
          catWrap.appendChild(header);

          const grid = document.createElement("div");
          grid.className = "sl-grid";
          grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill, minmax(100px, 1fr));gap:8px;padding:8px;transition:max-height 0.3s ease;";
          let collapsed = !1;
          header.addEventListener("click", () => {
            collapsed = !collapsed;
            grid.style.display = collapsed ? "none" : "grid";
            grid.dataset.collapsed = collapsed ? "true" : "";
            chevron.setAttribute("icon", collapsed ? "mdi:chevron-right" : "mdi:chevron-down");
          });

          const batchSize = 50;
          let shown = 0;
          for (const text of catTexts) {
            if (shown >= batchSize) break;
            const existing = items.find(i => i.summary.toLowerCase() === text.toLowerCase());
            if (existing) {
              grid.appendChild(this._renderTile(existing, list.entity, color));
            } else {
              grid.appendChild(this._renderGhostTile(text, list.entity, color));
            }
            shown++;
          }
          if (catTexts.length > batchSize) {
            const loadMore = document.createElement("div");
            loadMore.style.cssText = "display:flex;align-items:center;justify-content:center;padding:8px;border-radius:12px;background:#fafafa;border:1px dashed #ccc;cursor:pointer;margin-top:4px;grid-column:1 / -1;transition:all 0.15s;";
            loadMore.textContent = "Mehr laden (" + (catTexts.length - shown) + ")";
            loadMore.style.fontSize = "12px";
            loadMore.style.color = "#999";
            loadMore.addEventListener("mouseenter", () => { loadMore.style.background = "#e8f5e9"; loadMore.style.borderColor = color; });
            loadMore.addEventListener("mouseleave", () => { loadMore.style.background = "#fafafa"; loadMore.style.borderColor = "#ccc"; });
            let expanded = !1;
            loadMore.addEventListener("click", () => {
              if (expanded) return;
              expanded = !0;
              loadMore.remove();
              for (let i = batchSize; i < catTexts.length; i++) {
                const text = catTexts[i];
                const existing = items.find(it => it.summary.toLowerCase() === text.toLowerCase());
                if (existing) {
                  grid.appendChild(this._renderTile(existing, list.entity, color));
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
        card.appendChild(mirrorWrap);
      }
    }
    this.appendChild(card);
  }

  _renderTile(item, entityId, color) {
    const isDone = item.status === "completed";
    const tile = document.createElement("div");
    tile.dataset.summary = item.summary.toLowerCase();
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:" + (isDone ? "#e0e0e0" : color) + ";border:" + (isDone ? "2px solid #bbb" : "none") + ";opacity:" + (isDone ? "0.55" : "1") + ";cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;";
    tile.addEventListener("mouseenter", () => { if (!isDone) tile.style.background = "#388E3C"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = isDone ? "#e0e0e0" : color; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    const icon = this._createOpenmojiImg(this._getItemIcon(item.summary), 36);
    iconWrap.appendChild(icon);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:" + (isDone ? "#999" : "#fff") + ";text-decoration:" + (isDone ? "line-through" : "none") + ";max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = item.summary;
    tile.appendChild(label);

    if (item.description) {
      const desc = document.createElement("div");
      desc.style.cssText = "font-size:8px;color:" + (isDone ? "#999" : "rgba(255,255,255,0.75)") + ";text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      desc.textContent = item.description;
      tile.appendChild(desc);
    }

    let pressTimer, longPress = !1;
    const startPress = () => { longPress = !1; pressTimer = setTimeout(() => { longPress = !0; this._showEditModal(item, entityId); }, 600); };
    const endPress = () => { clearTimeout(pressTimer); };
    tile.addEventListener("touchstart", startPress, { passive: !0 });
    tile.addEventListener("touchend", endPress);
    tile.addEventListener("touchmove", endPress);
    tile.addEventListener("mousedown", startPress);
    tile.addEventListener("mouseup", endPress);
    tile.addEventListener("mouseleave", endPress);
    tile.addEventListener("click", () => { if (!longPress) this._toggleItem(entityId, item); });
    return tile;
  }

  _renderGhostTile(text, entityId, color) {
    const tile = document.createElement("div");
    tile.dataset.summary = text.toLowerCase();
    tile.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 5px 6px;border-radius:12px;background:#f5f5f5;border:2px dashed #ddd;opacity:0.65;cursor:pointer;min-height:72px;position:relative;transition:all 0.15s;user-select:none;";
    tile.addEventListener("mouseenter", () => { tile.style.background = "#e8f5e9"; tile.style.borderColor = color; tile.style.opacity = "0.9"; });
    tile.addEventListener("mouseleave", () => { tile.style.background = "#f5f5f5"; tile.style.borderColor = "#ddd"; tile.style.opacity = "0.65"; });

    const iconWrap = document.createElement("div");
    iconWrap.style.cssText = "display:flex;align-items:center;justify-content:center;width:42px;height:42px;flex-shrink:0;";
    const icon = this._createOpenmojiImg(this._getItemIcon(text), 36);
    iconWrap.appendChild(icon);
    tile.appendChild(iconWrap);

    const label = document.createElement("div");
    label.style.cssText = "font-size:10px;font-weight:500;text-align:center;color:#999;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3;";
    label.textContent = text;
    tile.appendChild(label);

    tile.addEventListener("click", () => this._addItem(entityId, text));
    return tile;
  }

  _showEditModal(item, entityId) {
    const existing = this.querySelector(".shopping-list-modal");
    existing && existing.remove();
    const overlay = document.createElement("div");
    overlay.className = "shopping-list-modal";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const box = document.createElement("div");
    box.style.cssText = "background:#fff;border-radius:16px;padding:20px;width:300px;max-width:90%;box-shadow:0 4px 20px rgba(0,0,0,0.3);";

    const title = document.createElement("div");
    title.style.cssText = "font-size:17px;font-weight:600;margin-bottom:12px;color:#2e7d32;";
    title.textContent = item.summary;
    box.appendChild(title);

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:13px;color:#666;margin-bottom:8px;";
    hint.textContent = "Anmerkung (z.B. 20 Bio, Frische)";
    box.appendChild(hint);

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.value = item.description || "";
    descInput.style.cssText = "width:100%;padding:10px;border-radius:8px;border:1px solid #c8e6c9;background:#f1f8e9;color:#333;font-size:15px;outline:none;margin-bottom:16px;box-sizing:border-box;";
    box.appendChild(descInput);

    const btns = document.createElement("div");
    btns.style.cssText = "display:flex;gap:8px;";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Speichern";
    saveBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:none;background:#43A047;color:#fff;font-size:15px;font-weight:600;cursor:pointer;";
    saveBtn.addEventListener("click", () => { this._updateDescription(entityId, item, descInput.value.trim()); overlay.remove(); });
    btns.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Abbrechen";
    cancelBtn.style.cssText = "flex:1;padding:10px;border-radius:8px;border:1px solid #c8e6c9;background:transparent;color:#333;font-size:15px;cursor:pointer;";
    cancelBtn.addEventListener("click", () => overlay.remove());
    btns.appendChild(cancelBtn);
    box.appendChild(btns);

    const delBtn = document.createElement("button");
    delBtn.textContent = "Löschen";
    delBtn.style.cssText = "width:100%;margin-top:8px;padding:8px;border-radius:8px;border:1px solid #ef5350;background:transparent;color:#ef5350;font-size:13px;cursor:pointer;";
    delBtn.addEventListener("click", () => { this._removeItem(entityId, item); overlay.remove(); });
    box.appendChild(delBtn);

    overlay.appendChild(box);
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    this.appendChild(overlay);
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
