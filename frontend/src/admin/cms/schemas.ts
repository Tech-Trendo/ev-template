import type { PrimitiveFieldType } from "./CmsEditor";
import type { CmsPageKey } from "@/lib/cmsDefaults";

export type CmsPrimitiveFieldDef = {
  key: string;
  label: string;
  type: PrimitiveFieldType;
  hint?: string;
  placeholder?: string;
  unit?: string;
  isAccent?: boolean;
};

export type CmsListFieldDef = {
  key: string;
  label: string;
  type: "list";
  itemName: string;
  hint?: string;
  itemFields: CmsPrimitiveFieldDef[];
};

export type CmsFieldDef = CmsPrimitiveFieldDef | CmsListFieldDef;

export type CmsGroupDef = {
  id?: string;
  title: string;
  description?: string;
  icon?: string;
  fields: CmsFieldDef[];
};

export type CmsPageMeta = {
  key: CmsPageKey;
  label: string;
  icon: string;
  description: string;
  sitePath: string;
};

export const CMS_PAGE_METAS: Record<CmsPageKey, CmsPageMeta> = {
  home: {
    key: "home",
    label: "Home Page",
    icon: "Home",
    description: "Hero banner, brand pillars, performance highlights, and savings teaser.",
    sitePath: "/",
  },
  vehicles: {
    key: "vehicles",
    label: "Vehicles Page",
    icon: "Truck",
    description: "Header banner and introduction text for the vehicle showroom.",
    sitePath: "/vehicles",
  },
  industries: {
    key: "industries",
    label: "Industries Page",
    icon: "Factory",
    description: "Commercial applications banner, industry grid, and image tiles.",
    sitePath: "/industries",
  },
  calculator: {
    key: "calculator",
    label: "Calculator",
    icon: "Calculator",
    description: "Header copy, tabs, ROI + EMI panels, default fleet and loan parameters.",
    sitePath: "/calculator",
  },
  roi: {
    key: "roi",
    label: "ROI Calculator (Legacy)",
    icon: "Calculator",
    description: "Legacy header copy — prefer Calculator page. Kept for backward compatibility.",
    sitePath: "/roi-calculator",
  },
  about: {
    key: "about",
    label: "About VT",
    icon: "Info",
    description: "About hero, standout feature highlights, and 'Why VT' commercial advantages.",
    sitePath: "/about",
  },
  stories: {
    key: "stories",
    label: "Blog Page",
    icon: "Newspaper",
    description: "Header banner text for the blog — customer stories and case studies.",
    sitePath: "/blog",
  },
  contact: {
    key: "contact",
    label: "Contact Page",
    icon: "Phone",
    description: "Showroom contact details, phone, email, and Google Maps embed configuration.",
    sitePath: "/contact",
  },
  quote: {
    key: "quote",
    label: "Quote Page",
    icon: "FileText",
    description: "Hero banner for the Request a Quote fleet quotation form.",
    sitePath: "/quote",
  },
  global: {
    key: "global",
    label: "Global Sections",
    icon: "Globe",
    description: "Re-usable components across the site, including the bottom CTA banner.",
    sitePath: "/about",
  },
};

const heroFields = (line1Label = "Headline line 1", line2Label = "Headline line 2 (accent)"): CmsPrimitiveFieldDef[] => [
  { key: "label", label: "Eyebrow label", type: "text", placeholder: "e.g. Electric Commercial Vehicles" },
  { key: "line1", label: line1Label, type: "text", placeholder: "Primary heading line" },
  { key: "line2", label: line2Label, type: "text", placeholder: "Accent heading line", isAccent: true },
  { key: "subhead", label: "Subheading description", type: "textarea", placeholder: "Detailed overview statement..." },
];

export const CMS_SCHEMAS: Record<CmsPageKey, CmsGroupDef[]> = {
  home: [
    {
      id: "hero",
      title: "Hero — ROI Calculator",
      icon: "Sparkles",
      description: "ROI hero with headline 'ELECTRIC PAYS FOR ITSELF.' and embedded payback/lifetime savings calculator on the right.",
      fields: [
        { key: "hero.badge", label: "Badge text", type: "text", placeholder: "ROI Calculator" },
        { key: "hero.line1", label: "Headline line 1", type: "text", placeholder: "ELECTRIC PAYS" },
        { key: "hero.line2", label: "Headline line 2", type: "text", placeholder: "FOR ITSELF." },
        { key: "hero.line3", label: "Headline line 3 (optional accent — leave empty to hide)", type: "text", placeholder: "(leave empty)" , isAccent: true},
        { key: "hero.subtext", label: "Supporting statement", type: "textarea", placeholder: "Model the return on investment of switching your fleet to VT electric vehicles. Set your real operating numbers and see payback period, lifetime savings, and emissions impact." },
        { key: "hero.primary_label", label: "Primary button label", type: "text", placeholder: "Calculate My Savings" },
        { key: "hero.primary_href", label: "Primary button link", type: "text", hint: "e.g. #roi-calculator or /calculator" },
        { key: "hero.secondary_label", label: "Secondary button label", type: "text", placeholder: "Request a Quote" },
        { key: "hero.secondary_href", label: "Secondary button link", type: "text", hint: "e.g. /quote" },
        { key: "hero.background_image", label: "Background image", type: "image", hint: "Recommended: 1920x1080 WebP/JPG" },
        { key: "hero.background_alt", label: "Background image alt text", type: "text", placeholder: "Himalayan mountain landscape" },
        {
          key: "hero.stats",
          label: "Hero Stats Strip",
          type: "list",
          itemName: "Stat",
          hint: "3 metrics under hero text. Tip: use payback, savings & CO₂ values — e.g. '18 mo / Avg Payback'. Live ROI is calculated dynamically on the right.",
          itemFields: [
            { key: "value", label: "Value", type: "text", placeholder: "18 mo" },
            { key: "label", label: "Label", type: "text", placeholder: "Avg Payback" },
          ],
        },
      ],
    },
    {
      id: "brand",
      title: "Brand Statement",
      icon: "ShieldCheck",
      description: "Core brand promise and four foundational pillars.",
      fields: [
        { key: "brand.badge", label: "Badge text", type: "text", placeholder: "The VT Promise" },
        { key: "brand.line1", label: "Headline line 1", type: "text", placeholder: "MORE THAN AN" },
        { key: "brand.line2", label: "Headline line 2", type: "text", placeholder: "ELECTRIC TRUCK." },
        { key: "brand.line3", label: "Headline line 3 (Blue Accent)", type: "text", placeholder: "A NEW WAY UP.", isAccent: true },
        { key: "brand.description", label: "Brand description", type: "textarea", placeholder: "VT combines electric power..." },
        {
          key: "brand.pillars",
          label: "Brand Pillars",
          type: "list",
          itemName: "Pillar",
          hint: "Four core engineering and value pillars.",
          itemFields: [
            { key: "word", label: "Pillar Title", type: "text", placeholder: "POWER" },
            { key: "sub", label: "Pillar Subtitle", type: "text", placeholder: "Mountain-grade torque" },
          ],
        },
      ],
    },
    {
      id: "stats",
      title: "Statistics Band",
      icon: "TrendingUp",
      description: "Key numerical proof points with animated count-up counters.",
      fields: [
        {
          key: "stats.items",
          label: "Count-up Stats",
          type: "list",
          itemName: "Stat",
          hint: "Number counts up automatically when scrolled into view.",
          itemFields: [
            { key: "value", label: "Number value", type: "number", placeholder: "330" },
            { key: "suffix", label: "Unit / Suffix", type: "text", placeholder: " KM", unit: "suffix" },
            { key: "label", label: "Stat Label", type: "text", placeholder: "Max Range" },
            { key: "note", label: "Footnote / Subtext", type: "text", placeholder: "260–330 km depending on model" },
          ],
        },
        { key: "stats.extra_value", label: "Special highlight value", type: "text", placeholder: "CATL" },
        { key: "stats.extra_label", label: "Special highlight label", type: "text", placeholder: "Battery Technology" },
        { key: "stats.extra_note", label: "Special highlight note", type: "text", placeholder: "World-leading cell manufacturer" },
      ],
    },
    {
      id: "performance",
      title: "Performance Section",
      icon: "Zap",
      description: "Mountain climbing capability, gradient engineering, and feature cards.",
      fields: [
        { key: "performance.badge", label: "Badge text", type: "text", placeholder: "Performance" },
        { key: "performance.line1", label: "Heading line 1", type: "text", placeholder: "BUILT FOR" },
        { key: "performance.line2", label: "Heading line 2", type: "text", placeholder: "THE CLIMB." },
        { key: "performance.subtext", label: "Description", type: "textarea", placeholder: "Our roads aren't ordinary..." },
        { key: "performance.background_image", label: "Background image", type: "image", hint: "Dramatic mountain landscape background" },
        {
          key: "performance.features",
          label: "Feature Cards",
          type: "list",
          itemName: "Feature",
          hint: "Icon character can be a symbol like ↑, ◎, ▣, ⚡, ★.",
          itemFields: [
            { key: "icon", label: "Icon Symbol", type: "text", placeholder: "⚡" },
            { key: "title", label: "Title", type: "text", placeholder: "HIGH TORQUE" },
            { key: "desc", label: "Description", type: "textarea", placeholder: "Engineered for demanding gradients..." },
          ],
        },
      ],
    },
    {
      id: "king",
      title: "Mountain King",
      icon: "Mountain",
      description: "Full-width brand statement, natural mountain background image, and footer caption.",
      fields: [
        { key: "king.line1", label: "Line 1", type: "text", placeholder: "MOUNTAIN" },
        { key: "king.line2", label: "Line 2 (Blue Accent)", type: "text", placeholder: "KING", isAccent: true },
        { key: "king.line3", label: "Line 3 (Optional)", type: "text", placeholder: "", isAccent: true },
        { key: "king.background_image", label: "Mountain Background Image", type: "image", hint: "High-resolution natural Himalayan / mountain landscape photo" },
        { key: "king.footer", label: "Footer caption", type: "text", placeholder: "EV OS · Electric Commercial Vehicles" },
      ],
    },
    {
      id: "technology",
      title: "Technology Section",
      icon: "Cpu",
      description: "CATL battery technology and electric powertrain details.",
      fields: [
        { key: "technology.badge", label: "Badge text", type: "text", placeholder: "Technology" },
        { key: "technology.line1", label: "Heading line 1", type: "text", placeholder: "POWERED BY" },
        { key: "technology.line2", label: "Heading line 2", type: "text", placeholder: "WHAT'S NEXT." },
        {
          key: "technology.features",
          label: "Technology Features",
          type: "list",
          itemName: "Feature",
          itemFields: [
            { key: "title", label: "Feature Title", type: "text", placeholder: "CATL BATTERY TECHNOLOGY" },
            { key: "desc", label: "Feature Description", type: "textarea", placeholder: "Advanced battery technology designed for reliability..." },
          ],
        },
      ],
    },
    {
      id: "built_for_road",
      title: "Built for the Road",
      icon: "MapPin",
      description: "Route corridors and geography-specific commercial suitability.",
      fields: [
        { key: "built_for_road.badge", label: "Badge text", type: "text", placeholder: "Built for the Road" },
        { key: "built_for_road.line1", label: "Heading line 1", type: "text", placeholder: "MADE FOR" },
        { key: "built_for_road.line2", label: "Heading line 2", type: "text", placeholder: "TOUGH ROADS." },
        { key: "built_for_road.subtext", label: "Description", type: "textarea", placeholder: "From city streets to long-haul routes..." },
        {
          key: "built_for_road.routes",
          label: "Key Route Corridors",
          type: "list",
          itemName: "Route",
          itemFields: [
            { key: "label", label: "Route Name", type: "text", placeholder: "Kathmandu to Pokhara" },
            { key: "note", label: "Route Note", type: "text", placeholder: "210 km mountain corridor" },
          ],
        },
      ],
    },
    {
      id: "calculator",
      title: "Savings Calculator Teaser",
      icon: "Calculator",
      description: "Home page quick savings comparison parameters.",
      fields: [
        { key: "calculator.badge", label: "Badge text", type: "text", placeholder: "Savings Calculator" },
        { key: "calculator.line1", label: "Heading line 1", type: "text", placeholder: "WHAT DOES DIESEL" },
        { key: "calculator.line2", label: "Heading line 2", type: "text", placeholder: "REALLY COST YOU?" },
        { key: "calculator.subtext", label: "Description", type: "textarea", placeholder: "Compare your current diesel operating costs with electric transportation." },
        { key: "calculator.cta_label", label: "Button CTA label", type: "text", placeholder: "Request a Detailed Fleet Analysis" },
        { key: "calculator.defaults.monthly_km", label: "Default monthly mileage", type: "number", unit: "KM" },
        { key: "calculator.defaults.diesel_price", label: "Default diesel price", type: "number", unit: "NPR" },
        { key: "calculator.defaults.fuel_consumption", label: "Default fuel consumption", type: "number", unit: "L/100km" },
        { key: "calculator.defaults.work_days", label: "Default working days / month", type: "number", unit: "days" },
        { key: "calculator.footnote", label: "Footnote disclaimer", type: "textarea" },
      ],
    },
  ],

  vehicles: [
    {
      id: "hero",
      title: "Vehicles Page Hero",
      icon: "Truck",
      description: "Main page header. Vehicle inventory cards are managed separately in the Vehicles Manager.",
      fields: heroFields("Headline line 1", "Headline line 2 (Blue Accent)"),
    },
  ],

  industries: [
    {
      id: "hero",
      title: "Industries Page Hero",
      icon: "Sparkles",
      description: "Introduction banner for commercial application sectors.",
      fields: heroFields(),
    },
    {
      id: "grid",
      title: "Industries Grid & Tiles",
      icon: "Factory",
      description: "Commercial transportation sectors and visual photo tiles.",
      fields: [
        { key: "section.badge", label: "Section Badge", type: "text", placeholder: "Industries" },
        { key: "section.heading_line1", label: "Heading line 1", type: "text", placeholder: "ONE TRUCK." },
        { key: "section.heading_line2", label: "Heading line 2", type: "text", placeholder: "MANY MISSIONS." },
        { key: "section.side_note", label: "Side note summary", type: "textarea" },
        {
          key: "tiles",
          label: "Industry Visual Tiles",
          type: "list",
          itemName: "Industry Tile",
          hint: "Tiles are displayed in a responsive bento grid.",
          itemFields: [
            { key: "name", label: "Sector Name", type: "text", placeholder: "Construction" },
            { key: "desc", label: "Description", type: "textarea", placeholder: "Heavy-duty transport for materials..." },
            { key: "image", label: "Tile Image", type: "image" },
            { key: "alt", label: "Image Alt Text", type: "text", placeholder: "Construction site logistics" },
          ],
        },
      ],
    },
  ],

  calculator: [
    {
      id: "header",
      title: "Calculator Header",
      icon: "Calculator",
      description: "Introduction banner for the combined ROI + EMI calculator page.",
      fields: [
        { key: "header.badge", label: "Badge text", type: "text", placeholder: "Calculator" },
        { key: "header.line1", label: "Heading line 1", type: "text", placeholder: "PLAN YOUR" },
        { key: "header.line2", label: "Heading line 2", type: "text", placeholder: "INVESTMENT." },
        { key: "header.subtext", label: "Description paragraph", type: "textarea" },
      ],
    },
    {
      id: "tabs",
      title: "Tab Labels",
      icon: "Layout",
      description: "Labels for the two calculator tabs.",
      fields: [
        { key: "tab_roi_label", label: "ROI tab label", type: "text", placeholder: "ROI Calculator" },
        { key: "tab_emi_label", label: "EMI tab label", type: "text", placeholder: "EMI Calculator" },
      ],
    },
    {
      id: "roi_panel",
      title: "ROI Panel",
      icon: "Sliders",
      description: "ROI calculator headings and CTA.",
      fields: [
        { key: "inputs_heading", label: "ROI inputs heading", type: "text", placeholder: "Your Operating Numbers" },
        { key: "cta_label", label: "ROI CTA button label", type: "text", placeholder: "Request a Detailed Fleet Analysis" },
        { key: "footnote", label: "Footnote disclaimer", type: "textarea" },
      ],
    },
    {
      id: "roi_defaults",
      title: "ROI Slider Defaults",
      icon: "Settings2",
      description: "Initial numbers preset when visitors open ROI tab.",
      fields: [
        { key: "defaults.fleet_size", label: "Vehicles in fleet", type: "number", unit: "trucks" },
        { key: "defaults.vehicle_price", label: "Vehicle purchase price", type: "number", unit: "NPR" },
        { key: "defaults.daily_km", label: "Daily distance per vehicle", type: "number", unit: "km/day" },
        { key: "defaults.operational_days", label: "Operational days per month", type: "number", unit: "days" },
        { key: "defaults.monthly_km", label: "Monthly mileage per vehicle (auto = daily × days)", type: "number", unit: "KM" },
        { key: "defaults.diesel_price", label: "Diesel price per litre", type: "number", unit: "NPR/L" },
        { key: "defaults.km_per_liter", label: "Fuel efficiency", type: "number", unit: "km/L" },
        { key: "defaults.fuel_consumption", label: "Fuel consumption (legacy L/100km)", type: "number", unit: "L/100km" },
        { key: "defaults.range_per_charge", label: "Electric range per full charge", type: "number", unit: "km" },
        { key: "defaults.battery_capacity", label: "Battery usable capacity per charge", type: "number", unit: "kWh" },
        { key: "defaults.electricity_tariff", label: "Electricity tariff per unit", type: "number", unit: "NPR/kWh" },
        { key: "defaults.elec_cost_per_km", label: "Electric cost per km (derived)", type: "number", unit: "NPR/km" },
        { key: "defaults.maintenance_lubrication", label: "Annual lubrication saving", type: "number", unit: "NPR" },
        { key: "defaults.maintenance_servicing", label: "Annual servicing saving", type: "number", unit: "NPR" },
        { key: "defaults.ownership_years", label: "Ownership period", type: "number", unit: "years" },
      ],
    },
    {
      id: "emi_panel",
      title: "EMI Panel",
      icon: "CreditCard",
      description: "EMI calculator headings, CTA and loan default parameters.",
      fields: [
        { key: "emi_heading", label: "EMI panel heading", type: "text", placeholder: "Loan Details" },
        { key: "emi_subtext", label: "EMI panel subtext", type: "textarea" },
        { key: "emi_cta_label", label: "EMI CTA button label", type: "text", placeholder: "Request a Detailed Quote" },
        { key: "emi_defaults.vehicle_price", label: "Default vehicle price (EMI)", type: "number", unit: "NPR" },
        { key: "emi_defaults.down_payment_percent", label: "Default down payment", type: "number", unit: "%" },
        { key: "emi_defaults.interest_rate", label: "Default interest rate", type: "number", unit: "% p.a." },
        { key: "emi_defaults.tenure_years", label: "Default tenure", type: "number", unit: "years" },
      ],
    },
  ],

  roi: [
    {
      id: "header",
      title: "ROI Calculator Header (Legacy)",
      icon: "Calculator",
      description: "Legacy — use Calculator page instead. Kept for backward compatibility.",
      fields: [
        { key: "header.badge", label: "Badge text", type: "text", placeholder: "ROI Calculator" },
        { key: "header.line1", label: "Heading line 1", type: "text", placeholder: "ELECTRIC PAYS" },
        { key: "header.line2", label: "Heading line 2", type: "text", placeholder: "FOR ITSELF." },
        { key: "header.subtext", label: "Description paragraph", type: "textarea" },
      ],
    },
    {
      id: "calculator",
      title: "Calculator Controls & CTA (Legacy)",
      icon: "Sliders",
      description: "Legacy ROI panel.",
      fields: [
        { key: "inputs_heading", label: "Inputs panel heading", type: "text", placeholder: "Your Operating Numbers" },
        { key: "cta_label", label: "Bottom CTA button label", type: "text", placeholder: "Request a Detailed Fleet Analysis" },
        { key: "footnote", label: "Footnote disclaimer", type: "textarea" },
      ],
    },
    {
      id: "defaults",
      title: "Slider Default Parameters (Legacy)",
      icon: "Settings2",
      description: "Legacy ROI defaults.",
      fields: [
        { key: "defaults.fleet_size", label: "Vehicles in fleet", type: "number", unit: "trucks" },
        { key: "defaults.vehicle_price", label: "Vehicle purchase price", type: "number", unit: "NPR" },
        { key: "defaults.daily_km", label: "Daily distance per vehicle", type: "number", unit: "km/day" },
        { key: "defaults.operational_days", label: "Operational days per month", type: "number", unit: "days" },
        { key: "defaults.monthly_km", label: "Monthly mileage per vehicle (auto = daily × days)", type: "number", unit: "KM" },
        { key: "defaults.diesel_price", label: "Diesel price per litre", type: "number", unit: "NPR/L" },
        { key: "defaults.km_per_liter", label: "Fuel efficiency", type: "number", unit: "km/L" },
        { key: "defaults.fuel_consumption", label: "Fuel consumption (legacy L/100km)", type: "number", unit: "L/100km" },
        { key: "defaults.range_per_charge", label: "Electric range per full charge", type: "number", unit: "km" },
        { key: "defaults.battery_capacity", label: "Battery usable capacity per charge", type: "number", unit: "kWh" },
        { key: "defaults.electricity_tariff", label: "Electricity tariff per unit", type: "number", unit: "NPR/kWh" },
        { key: "defaults.elec_cost_per_km", label: "Electric cost per km (derived)", type: "number", unit: "NPR/km" },
        { key: "defaults.maintenance_lubrication", label: "Annual lubrication saving", type: "number", unit: "NPR" },
        { key: "defaults.maintenance_servicing", label: "Annual servicing saving", type: "number", unit: "NPR" },
        { key: "defaults.ownership_years", label: "Ownership period", type: "number", unit: "years" },
      ],
    },
  ],

  about: [
    {
      id: "hero",
      title: "About Page Hero",
      icon: "Info",
      description: "Top headline and mission overview.",
      fields: heroFields(),
    },
    {
      id: "highlights",
      title: "Standout Highlights",
      icon: "Star",
      description: "Four prominent cards with highlighted blue accent keywords.",
      fields: [
        { key: "highlights.badge", label: "Badge text", type: "text", placeholder: "Why VT Stands Out" },
        { key: "highlights.line1", label: "Heading line 1", type: "text", placeholder: "BUILT FOR THE ROAD." },
        { key: "highlights.line2", label: "Heading line 2 (Blue Accent)", type: "text", placeholder: "BUILT FOR BIG WORK.", isAccent: true },
        { key: "highlights.subtext", label: "Description", type: "textarea" },
        {
          key: "highlights.items",
          label: "Highlight Cards",
          type: "list",
          itemName: "Highlight Card",
          hint: "The 'Accent phrase' must appear inside the 'Title' text to be highlighted in blue.",
          itemFields: [
            { key: "title", label: "Card Title", type: "text", placeholder: "Built for big savings." },
            { key: "accent", label: "Accent phrase (colored blue)", type: "text", placeholder: "big savings", isAccent: true },
            { key: "desc", label: "Card Description", type: "textarea" },
          ],
        },
      ],
    },
    {
      id: "why_choose_us",
      title: "Why VT Section",
      icon: "CheckCircle2",
      description: "Four commercial advantages and fleet benefits.",
      fields: [
        { key: "why_choose_us.badge", label: "Badge text", type: "text", placeholder: "The Advantage" },
        { key: "why_choose_us.heading", label: "Heading", type: "text", placeholder: "WHY VT?" },
        { key: "why_choose_us.side_note", label: "Side note quote", type: "textarea" },
        {
          key: "why_choose_us.reasons",
          label: "Commercial Reasons Grid",
          type: "list",
          itemName: "Reason",
          itemFields: [
            { key: "title", label: "Reason Title", type: "text", placeholder: "BUILT FOR COMMERCIAL WORK" },
            { key: "desc", label: "Reason Description", type: "textarea" },
          ],
        },
      ],
    },
  ],

  stories: [
    {
      id: "hero",
      title: "Stories Page Hero",
      icon: "Newspaper",
      description: "Header banner. Articles and case studies are managed in the Stories Manager.",
      fields: heroFields(),
    },
  ],

  contact: [
    {
      id: "hero",
      title: "Contact Page Hero",
      icon: "Phone",
      description: "Top banner welcoming inquiries and test drive requests.",
      fields: heroFields(),
    },
    {
      id: "info",
      title: "Showroom & Contact Details",
      icon: "Building2",
      description: "Physical location, telephone lines, and customer service email.",
      fields: [
        { key: "info.company_name", label: "Company / Showroom Name", type: "text", placeholder: "EV OS" },
        { key: "info.address_primary", label: "Primary Address Line", type: "text", placeholder: "Wuling & VT Showroom, Bagdol, Lalitpur" },
        { key: "info.address_secondary", label: "Secondary Address Line", type: "text", placeholder: "Opposite Jawalakhel, Bagdol–3" },
        { key: "info.maps_link", label: "Google Maps direct share link", type: "text", hint: "Opens Google Maps in user's browser" },
        { key: "info.phone_label", label: "Phone section heading", type: "text", placeholder: "Sales & Service" },
        { key: "info.phone", label: "Phone number", type: "text", placeholder: "+977 1 442 0000" },
        { key: "info.email_label", label: "Email section heading", type: "text", placeholder: "Email" },
        { key: "info.email", label: "Email address", type: "text", placeholder: "info@evos.example.com" },
      ],
    },
    {
      id: "map",
      title: "Google Map Embed",
      icon: "MapPin",
      description: "Interactive map iframe embed configuration.",
      fields: [
        { key: "map.badge", label: "Badge text", type: "text", placeholder: "Visit Us" },
        { key: "map.heading", label: "Map heading", type: "text", placeholder: "Find us in Bagdol." },
        { key: "map.subtext", label: "Map description", type: "textarea" },
        { key: "map.embed_url", label: "Google Maps iframe src URL", type: "text", hint: "From Google Maps > Share > Embed a map > src URL" },
        { key: "map.caption", label: "Location caption under map", type: "text" },
      ],
    },
  ],

  quote: [
    {
      id: "hero",
      title: "Quote Page Hero",
      icon: "FileText",
      description: "Top banner for the fleet quotation request form.",
      fields: heroFields("Headline line 1", "Headline line 2 (accent)"),
    },
  ],

  global: [
    {
      id: "brand",
      title: "Brand & Logo",
      icon: "Image",
      description: "Upload and manage website logos across Header Navbar, Footer, and Admin Console.",
      fields: [
        {
          key: "brand.logo_url",
          label: "Primary Website Logo (Navbar & Admin)",
          type: "image",
          hint: "Main logo displayed on header navbar, login page, and admin console. Upload an image or provide URL.",
          placeholder: "/favicon.svg",
        },
        {
          key: "brand.logo_white_url",
          label: "Footer Logo (White / Inverted, optional)",
          type: "image",
          hint: "Optional logo for dark footer backgrounds. If left blank, the primary logo will be used.",
          placeholder: "/favicon.svg",
        },
        {
          key: "brand.logo_alt",
          label: "Logo Alt Text",
          type: "text",
          placeholder: "EV OS",
        },
      ],
    },
    {
      id: "cta",
      title: "CTA Banner",
      icon: "Globe",
      description: "The dark cinematic banner featured across page footers throughout the site.",
      fields: [
        { key: "cta.badge", label: "Badge text", type: "text", placeholder: "Experience VT" },
        { key: "cta.line1", label: "Heading line 1", type: "text", placeholder: "READY TO" },
        { key: "cta.line2", label: "Heading line 2", type: "text", placeholder: "GO ELECTRIC?" },
        { key: "cta.subtext", label: "Description paragraph", type: "textarea" },
        { key: "cta.primary_label", label: "Primary button label", type: "text", placeholder: "Request a Quote" },
        { key: "cta.primary_href", label: "Primary button link", type: "text", placeholder: "/quote" },
        { key: "cta.secondary_label", label: "Secondary button label", type: "text", placeholder: "Request a Quote" },
        { key: "cta.secondary_href", label: "Secondary button link", type: "text", placeholder: "/quote" },
        { key: "cta.background_image", label: "Background image", type: "image", hint: "High resolution landscape banner" },
      ],
    },
    {
      id: "footer",
      title: "Footer",
      icon: "Layout",
      description: "Brand tagline, description, bottom bar text and Developed and Maintained by backlink (SEO). Vehicles list in footer is auto-synced from Vehicles Manager.",
      fields: [
        { key: "footer.tagline_line1", label: "Footer tagline line 1", type: "text", placeholder: "Mountain" },
        { key: "footer.tagline_line2", label: "Footer tagline line 2 (accent line)", type: "text", placeholder: "King." },
        { key: "footer.description", label: "Footer brand description", type: "textarea", placeholder: "Electric commercial vehicles engineered for demanding routes..." },
        { key: "footer.contact_heading", label: "Contact block heading", type: "text", placeholder: "Contact" },
        { key: "footer.contact_subtext", label: "Contact block subtext", type: "textarea", placeholder: "Questions about vehicles, test drives or service..." },
        { key: "footer.bottom_brand_text", label: "Bottom bar brand tagline", type: "text", placeholder: "MOUNTAIN KING." },
        { key: "footer.created_by_label", label: "Developed and Maintained by label", type: "text", placeholder: "Developed and Maintained by" },
        { key: "footer.created_by_name", label: "Developed and Maintained by name (linked)", type: "text", placeholder: "TechTrendo" },
        { key: "footer.created_by_url", label: "Developed and Maintained by URL (backlink)", type: "text", placeholder: "https://techtrendo.com/", hint: "Do-follow SEO backlink — keep as https://techtrendo.com/" },
      ],
    },
  ],
};
