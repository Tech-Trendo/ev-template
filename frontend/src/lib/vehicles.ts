import { api } from "./api";

export type VehicleStat = {
  id?: number;
  label: string;
  value: string;
  sort_order: number;
};

export type VehicleFeature = {
  id?: number;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
};

export type VehicleGalleryImage = {
  id?: number;
  image?: string | null;
  image_url: string;
  image_display: string;
  alt_text: string;
  caption: string;
  sort_order: number;
  _preview?: string;
};

export type Specification = {
  id?: number;
  label: string;
  value: string;
  sort_order: number;
};

export type SpecificationGroup = {
  id?: number;
  title: string;
  sort_order: number;
  specifications: Specification[];
};

export type Vehicle = {
  id: number;
  slug: string;
  name: string;
  category: string;
  payload: string;
  range_km: string;
  battery: string;
  image: string | null;
  image_url: string;
  image_display: string;
  tag: string;
  alt_text: string;
  description: string;
  hero_heading: string;
  hero_description: string;
  primary_cta_label: string;
  secondary_cta_label: string;
  engineered_heading: string;
  engineered_description: string;
  is_active: boolean;
  sort_order: number;
  stats: VehicleStat[];
  features: VehicleFeature[];
  gallery: VehicleGalleryImage[];
  specification_groups: SpecificationGroup[];
  stock_summary?: {
    total_units: number;
    in_stock: number;
    sold: number;
    in_servicing: number;
  };
};

export function fetchVehicles(): Promise<Vehicle[]> {
  return api<Vehicle[]>("/api/vehicles/", { cache: "no-store" } as RequestInit);
}

export function fetchVehicle(slug: string): Promise<Vehicle> {
  return api<Vehicle>(`/api/vehicles/${encodeURIComponent(slug)}/`, { cache: "no-store" } as RequestInit);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
