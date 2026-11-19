export type CmsPageKey =
  | "home"
  | "vehicles"
  | "industries"
  | "calculator"
  | "roi"
  | "about"
  | "stories"
  | "contact"
  | "quote"
  | "global";

export interface HeroStat {
  value: string;
  label: string;
}

export interface HomeContent {
  hero: {
    badge: string;
    line1: string;
    line2: string;
    line3: string;
    subtext: string;
    primary_label: string;
    primary_href: string;
    secondary_label: string;
    secondary_href: string;
    background_image: string;
    background_alt: string;
    stats: HeroStat[];
  };
  brand: {
    badge: string;
    line1: string;
    line2: string;
    line3: string;
    description: string;
    pillars: { word: string; sub: string }[];
  };
  stats: {
    items: { value: number; suffix: string; label: string; note: string }[];
    extra_value: string;
    extra_label: string;
    extra_note: string;
  };
  performance: {
    badge: string;
    line1: string;
    line2: string;
    subtext: string;
    background_image: string;
    features: { title: string; desc: string; icon: string }[];
  };
  king: { line1: string; line2: string; line3: string; footer: string; background_image?: string };
  technology: {
    badge: string;
    line1: string;
    line2: string;
    features: { title: string; desc: string }[];
  };
  built_for_road: {
    badge: string;
    line1: string;
    line2: string;
    subtext: string;
    routes: { label: string; note: string }[];
  };
  calculator: {
    badge: string;
    line1: string;
    line2: string;
    subtext: string;
    cta_label: string;
    defaults: {
      monthly_km: number;
      diesel_price: number;
      fuel_consumption: number;
      work_days: number;
    };
    footnote: string;
  };
}

export interface PageHeroContent {
  label: string;
  line1: string;
  line2: string;
  subhead: string;
}

export interface IndustriesContent {
  hero: PageHeroContent;
  section: {
    badge: string;
    heading_line1: string;
    heading_line2: string;
    side_note: string;
  };
  tiles: { name: string; desc: string; image: string; alt: string }[];
}

export interface RoiContent {
  header: { badge: string; line1: string; line2: string; subtext: string };
  inputs_heading: string;
  cta_label: string;
  footnote: string;
  tab_roi_label: string;
  tab_emi_label: string;
  emi_heading: string;
  emi_subtext: string;
  emi_cta_label: string;
  defaults: {
    fleet_size: number;
    vehicle_price: number;
    monthly_km: number;
    diesel_price: number;
    fuel_consumption: number;
    elec_cost_per_km: number;
    ownership_years: number;
    // Sheet-modelled fields (new)
    daily_km: number;
    operational_days: number;
    km_per_liter: number;
    range_per_charge: number;
    battery_capacity: number;
    electricity_tariff: number;
    maintenance_lubrication: number;
    maintenance_servicing: number;
  };
  emi_defaults: {
    vehicle_price: number;
    down_payment_percent: number;
    interest_rate: number;
    tenure_years: number;
  };
}

export type CalculatorContent = RoiContent;

export interface AboutContent {
  hero: PageHeroContent;
  highlights: {
    badge: string;
    line1: string;
    line2: string;
    subtext: string;
    items: { title: string; accent: string; desc: string }[];
  };
  why_choose_us: {
    badge: string;
    heading: string;
    side_note: string;
    reasons: { title: string; desc: string }[];
  };
}

export interface ContactContent {
  hero: PageHeroContent;
  info: {
    company_name: string;
    address_primary: string;
    address_secondary: string;
    maps_link: string;
    phone_label: string;
    phone: string;
    email_label: string;
    email: string;
  };
  map: {
    badge: string;
    heading: string;
    subtext: string;
    embed_url: string;
    caption: string;
  };
}

export interface QuoteContent {
  hero: PageHeroContent;
}

export interface GlobalContent {
  brand: {
    logo_url: string;
    logo_white_url?: string;
    logo_alt?: string;
  };
  cta: {
    badge: string;
    line1: string;
    line2: string;
    subtext: string;
    primary_label: string;
    primary_href: string;
    secondary_label: string;
    secondary_href: string;
    background_image: string;
  };
  footer: {
    tagline_line1: string;
    tagline_line2: string;
    description: string;
    contact_heading: string;
    contact_subtext: string;
    bottom_brand_text: string;
    created_by_label: string;
    created_by_name: string;
    created_by_url: string;
  };
}

export type CmsContent = {
  home: HomeContent;
  vehicles: PageHeroContent;
  industries: IndustriesContent;
  calculator: CalculatorContent;
  roi: RoiContent;
  about: AboutContent;
  stories: PageHeroContent;
  contact: ContactContent;
  quote: QuoteContent;
  global: GlobalContent;
};

const UNSPLASH_PERFORMANCE_BG = "";
const UNSPLASH_CTA_BG = "";

export const CMS_DEFAULTS: CmsContent = {
  home: {
    hero: {
      badge: "Commercial Electric Vehicles",
      line1: "MOUNTAIN",
      line2: "KING",
      line3: "",
      subtext:
        "Electric commercial trucks engineered with CATL battery power, 36% gradeability, and payloads up to 10 tons.",
      primary_label: "Explore Vehicles",
      primary_href: "/vehicles",
      secondary_label: "Request a Quote",
      secondary_href: "/quote",
      background_image: "/static",
      background_alt: "VT electric commercial vehicle driving along a Himalayan mountain highway in the region",
      stats: [
        { value: "0 CO₂", label: "Zero Tailpipe" },
      ],
    },
    brand: {
      badge: "The VT Promise",
      line1: "ELECTRIC TRUCKS",
      line2: "BUILT FOR THE ROAD",
      line3: "MOUNTAIN ROADS.",
      description:
        "VT combines electric power, advanced battery technology and purpose-built commercial vehicle engineering to help businesses move further with less environmental impact.",
      pillars: [
        { word: "POWER", sub: "Mountain-grade torque" },
        { word: "RANGE", sub: "Built for elevation" },
        { word: "SAVINGS", sub: "Lower cost per km" },
        { word: "CLEAN", sub: "Zero direct emissions" },
      ],
    },
    stats: {
      items: [
        { value: 330, suffix: " KM", label: "Max Range", note: "275 to 330 km depending on model" },
        { value: 10, suffix: " TON", label: "Max Payload", note: "6 to 10 ton range" },
      ],
      extra_value: "CATL",
      extra_label: "Battery Technology",
      extra_note: "Lithium iron phosphate battery manufacturer",
    },
    performance: {
      badge: "Performance",
      line1: "BUILT FOR",
      line2: "THE CLIMB.",
      subtext:
        "Our roads aren't ordinary. VT vehicles are engineered for the gradients, terrain and demands that define working transportation across the country.",
      background_image: UNSPLASH_PERFORMANCE_BG,
      features: [
        { title: "HIGH TORQUE", desc: "Engineered for demanding gradients and steep mountain roads.", icon: "↑" },
        { title: "LONG RANGE", desc: "Designed for long working routes without range anxiety.", icon: "◎" },
        { title: "HEAVY PAYLOAD", desc: "Ready for the most demanding commercial work loads.", icon: "▣" },
        { title: "ELECTRIC POWER", desc: "Efficient, quiet and emission-free at the tailpipe.", icon: "E" },
      ],
    },
    king: {
      line1: "MOUNTAIN",
      line2: "KING",
      line3: "",
      footer: "EV OS · Electric Commercial Vehicles",
      background_image: "",
    },
    technology: {
      badge: "Technology",
      line1: "ENGINEERED WITH",
      line2: "CATL BATTERIES.",
      features: [
        {
          title: "CATL BATTERY TECHNOLOGY",
          desc: "Advanced battery technology designed for reliability and long-term performance in demanding environments.",
        },
        {
          title: "ELECTRIC POWERTRAIN",
          desc: "Instant torque and smooth power delivery engineered for commercial loads and mountain gradients.",
        },
        {
          title: "ENERGY EFFICIENCY",
          desc: "Reduce fuel dependency and operating costs. Regenerative braking recovers energy on descents.",
        },
        {
          title: "SMART ENGINEERING",
          desc: "Commercial vehicle engineering focused on real-world working conditions, not concept car performance.",
        },
      ],
    },
    built_for_road: {
      badge: "Built for the Road",
      line1: "MADE FOR",
      line2: "TOUGH ROADS.",
      subtext:
        "From Kathmandu's busy streets to high-altitude mountain routes, VT is built around the realities of commercial transportation needs.",
      routes: [
        { label: "Kathmandu Valley", note: "Urban distribution hub" },
        { label: "Kathmandu to Pokhara", note: "210 km mountain corridor" },
        { label: "Mountain Logistics", note: "High-altitude supply routes" },
        { label: "Construction Routes", note: "Infrastructure projects" },
        { label: "Urban Delivery", note: "Last-mile efficiency" },
        { label: "Rural Distribution", note: "Remote area coverage" },
      ],
    },
    calculator: {
      badge: "Savings Calculator",
      line1: "WHAT DOES DIESEL",
      line2: "REALLY COST YOU?",
      subtext: "Compare your current diesel operating costs with electric transportation.",
      cta_label: "Request a Detailed Fleet Analysis",
      defaults: { monthly_km: 6500, diesel_price: 195, fuel_consumption: 20, work_days: 26 },
      footnote:
        "* Estimates based on current fuel prices and average VT operating costs. Actual savings may vary. Contact us for a detailed fleet analysis.",
    },
  },

  vehicles: {
    label: "Vehicle Range",
    line1: "VT COMMERCIAL",
    line2: "VEHICLE FLEET.",
    subhead: "Every VT truck is engineered for demanding roads, gradients and working conditions.",
  },

  industries: {
    hero: {
      label: "Applications",
      line1: "ACROSS EVERY",
      line2: "INDUSTRY.",
      subhead:
        "VT electric trucks serve every commercial transportation sector that drives the region's economy.",
    },
    section: {
      badge: "Industries",
      heading_line1: "ONE TRUCK.",
      heading_line2: "MANY MISSIONS.",
      side_note: "VT serves every commercial transportation sector that drives the region's economy.",
    },
    tiles: [
      {
        name: "Construction",
        desc: "Heavy-duty transport for materials, equipment and site logistics across the region's building sites.",
        image: "",
        alt: "VT electric commercial truck delivering materials to a construction site in the region",
      },
      {
        name: "Mountain Logistics",
        desc: "Long-haul routes through high-altitude passes and mountain terrain.",
        image: "",
        alt: "VT electric cargo truck transporting freight across a mountain valley in the region",
      },
      {
        name: "Distribution",
        desc: "Efficient last-mile and regional distribution for the region's growing commerce.",
        image: "",
        alt: "VT electric commercial vehicle performing regional distribution in the region",
      },
      {
        name: "Cold Chain",
        desc: "Temperature-sensitive cargo from farmgate to urban market.",
        image: "",
        alt: "VT refrigerated electric truck transporting temperature-sensitive agricultural goods in the region",
      },
      {
        name: "Municipal Services",
        desc: "Waste management, utilities and civic operations across the region's municipalities.",
        image: "",
        alt: "VT electric commercial truck operating in the regioni municipality",
      },
      {
        name: "Urban Delivery",
        desc: "Clean, quiet electric delivery optimized for Kathmandu Valley traffic.",
        image: "",
        alt: "VT electric delivery van navigating urban Kathmandu traffic with zero emissions",
      },
    ],
  },

  calculator: {
    header: {
      badge: "Calculator",
      line1: "PLAN YOUR",
      line2: "INVESTMENT.",
      subtext:
        "Compare ROI and monthly EMI in one place. Model fleet savings and financing for your VT electric vehicles.",
    },
    inputs_heading: "Your Operating Numbers",
    cta_label: "Request a Detailed Fleet Analysis",
    footnote: "",
    tab_roi_label: "ROI Calculator",
    tab_emi_label: "EMI Calculator",
    emi_heading: "Loan Details",
    emi_subtext: "Adjust down payment, interest and tenure to see your monthly EMI instantly.",
    emi_cta_label: "Request a Detailed Quote",
    defaults: {
      fleet_size: 1,
      vehicle_price: 5500000,
      monthly_km: 6500,
      diesel_price: 195,
      fuel_consumption: 20,
      elec_cost_per_km: 4.03,
      ownership_years: 8,
      daily_km: 250,
      operational_days: 26,
      km_per_liter: 5,
      range_per_charge: 275,
      battery_capacity: 100.27,
      electricity_tariff: 10.44,
      maintenance_lubrication: 114400,
      maintenance_servicing: 52000,
    },
    emi_defaults: {
      vehicle_price: 5500000,
      down_payment_percent: 20,
      interest_rate: 11,
      tenure_years: 5,
    },
  },

  roi: {
    header: {
      badge: "ROI Calculator",
      line1: "ELECTRIC FLEET",
      line2: "COST CALCULATOR.",
      subtext:
        "Model the cost of switching your fleet to VT electric vehicles. Set your real operating numbers and compare energy and maintenance costs with diesel.",
    },
    inputs_heading: "Your Operating Numbers",
    cta_label: "Request a Detailed Fleet Analysis",
    footnote: "",
    tab_roi_label: "ROI Calculator",
    tab_emi_label: "EMI Calculator",
    emi_heading: "Loan Details",
    emi_subtext: "Adjust down payment, interest and tenure to see your monthly EMI instantly.",
    emi_cta_label: "Request a Detailed Quote",
    defaults: {
      fleet_size: 1,
      vehicle_price: 5500000,
      monthly_km: 6500,
      diesel_price: 195,
      fuel_consumption: 20,
      elec_cost_per_km: 4.03,
      ownership_years: 8,
      daily_km: 250,
      operational_days: 26,
      km_per_liter: 5,
      range_per_charge: 275,
      battery_capacity: 100.27,
      electricity_tariff: 10.44,
      maintenance_lubrication: 114400,
      maintenance_servicing: 52000,
    },
    emi_defaults: {
      vehicle_price: 5500000,
      down_payment_percent: 20,
      interest_rate: 11,
      tenure_years: 5,
    },
  },

  about: {
    hero: {
      label: "About",
      line1: "MADE FOR",
      line2: "TOUGH ROADS.",
      subhead:
        "Electric commercial vehicles engineered for the gradients, terrain and working conditions that define the region's transport network.",
    },
    highlights: {
      badge: "Why VT Stands Out",
      line1: "BUILT FOR THE ROAD.",
      line2: "BUILT FOR BIG WORK.",
      subtext:
        "Four clear reasons fleets everywhere are switching to VT: lower cost, higher payload, electric power and engineering made for our roads.",
      items: [
        {
          title: "Built for big savings.",
          accent: "big savings",
          desc: "Cut fuel and maintenance costs drastically. Electric efficiency delivers lower cost per kilometre, every trip.",
        },
        {
          title: "Up to 10 Ton payload.",
          accent: "10 Ton",
          desc: "Maximum payload without compromise: commercial-grade steel frame engineered for the region's toughest loads.",
        },
        {
          title: "New era of electric cargo.",
          accent: "electric cargo",
          desc: "CATL battery system, instant torque and zero emissions: the next generation of commercial transport.",
        },
        {
          title: "Exclusively built for the toughest roads.",
          accent: "the toughest roads",
          desc: "Tested on steep gradients and high-altitude routes: mountain-grade torque, reliability and control.",
        },
      ],
    },
    why_choose_us: {
      badge: "The Advantage",
      heading: "WHY VT?",
      side_note: "Built differently. Performs differently. Costs less to run.",
      reasons: [
        {
          title: "BUILT FOR COMMERCIAL WORK",
          desc: "Designed around real fleet requirements: payload, range, durability and driver experience in real working conditions.",
        },
        {
          title: "ELECTRIC PERFORMANCE",
          desc: "Instant torque from standstill. Efficient power delivery that outperforms diesel on gradient climbs and heavy loads.",
        },
        {
          title: "LOWER OPERATING COST",
          desc: "Reduce fuel and maintenance expenses significantly. Electric drivetrain means fewer service intervals and lower total cost of ownership.",
        },
        {
          title: "READY FOR THE ROAD",
          desc: "Engineered specifically for demanding mountain roads, extreme gradients and commercial transportation realities.",
        },
      ],
    },
  },

  stories: {
    label: "Stories",
    line1: "FROM THE",
    line2: "FIELD.",
    subhead:
      "Field reports, customer wins, and engineering notes from EV OS's electric fleet journey.",
  },

  contact: {
    hero: {
      label: "Get in Touch",
      line1: "Talk to our",
      line2: "team in Bagdol.",
      subhead: "Questions about vehicles, after-sales and general enquiries: we respond within one business day.",
    },
    info: {
      company_name: "EV OS",
      address_primary: "Your Showroom, Your Address, Your City",
      address_secondary: "Opposite Jawalakhel, Bagdol-3",
      maps_link: "https://share.google/k48vHdFOU8M1jExYy",
      phone_label: "Sales & Service",
      phone: "+977 1 442 0000",
      email_label: "Email",
      email: "info@evos.example.com",
    },
    map: {
      badge: "Visit Us",
      heading: "Find us in Bagdol.",
      subtext:
        "EV OS showroom and service centre, Lalitpur: walk in for a closer look at the fleet.",
      embed_url:
        "",
      caption: "EV OS: Wuling & VT Showroom, Bagdol, Lalitpur",
    },
  },

  quote: {
    hero: {
      label: "Request a Quote",
      line1: "BUILD YOUR",
      line2: "FLEET QUOTE.",
      subhead:
        "Tell us about your vehicles, fleet size and routes: we’ll send a detailed, no-obligation proposal within one business day.",
    },
  },

  global: {
    brand: {
      logo_url: "/favicon.svg",
      logo_white_url: "/favicon.svg",
      logo_alt: "EV OS",
    },
    cta: {
      badge: "Experience VT",
      line1: "READY TO",
      line2: "GO ELECTRIC?",
      subtext: "Experience VT power on demanding roads. Request a quote for your fleet.",
      primary_label: "Request a Quote",
      primary_href: "/quote",
      secondary_label: "Request a Quote",
      secondary_href: "/quote",
      background_image: UNSPLASH_CTA_BG,
    },
    footer: {
      tagline_line1: "Mountain",
      tagline_line2: "King.",
      description:
        "Electric commercial vehicles engineered for demanding roads, mountains and commercial transportation needs.",
      contact_heading: "Contact",
      contact_subtext: "Questions about vehicles, test drives or service? Get in touch with our team.",
      bottom_brand_text: "MOUNTAIN KING.",
      created_by_label: "Developed and Maintained by",
      created_by_name: "TechTrendo",
      created_by_url: "https://techtrendo.com/",
    },
  },
};

export const CMS_PAGE_LABELS: Record<CmsPageKey, string> = {
  home: "Home Page",
  vehicles: "Vehicles Page",
  industries: "Industries Page",
  calculator: "Calculator Page",
  roi: "ROI Calculator Page (Legacy)",
  about: "About Page",
  stories: "Blog Page",
  contact: "Contact Page",
  quote: "Quote Page",
  global: "Global Sections",
};
