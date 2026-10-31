import type { TemplateId } from "../db/schema";

export type SegmentId =
  | "barbearia"
  | "salao"
  | "estetica"
  | "clinica"
  | "restaurante"
  | "cafeteria"
  | "oficina"
  | "petshop"
  | "servicos";

export type Segment = {
  id: SegmentId;
  label: string;
  template: TemplateId;
  priority: boolean;
  osm: string[]; // Overpass tag filters
  googleQuery: string;
  defaultServices: string[]; // only used as *suggestions* pending review, never published unverified
};

export const SEGMENTS: Segment[] = [
  {
    id: "barbearia",
    label: "Barbearia",
    template: "barber",
    priority: true,
    osm: ['["shop"="hairdresser"]["hairdresser"~"barber|men"]', '["shop"="barber"]', '["shop"="hairdresser"]["name"~"[Bb]arb"]'],
    googleQuery: "barbearia",
    defaultServices: ["Corte de cabelo", "Barba", "Corte + barba"],
  },
  {
    id: "salao",
    label: "Salão de beleza",
    template: "barber",
    priority: true,
    osm: ['["shop"="hairdresser"]'],
    googleQuery: "salão de beleza",
    defaultServices: ["Corte", "Escova", "Coloração"],
  },
  {
    id: "estetica",
    label: "Estética",
    template: "aesthetics",
    priority: true,
    osm: ['["shop"="beauty"]', '["beauty"]'],
    googleQuery: "clínica de estética",
    defaultServices: ["Limpeza de pele", "Design de sobrancelhas", "Depilação"],
  },
  {
    id: "clinica",
    label: "Clínica / Saúde",
    template: "aesthetics",
    priority: false,
    osm: ['["amenity"="dentist"]', '["amenity"="clinic"]', '["healthcare"="physiotherapist"]'],
    googleQuery: "clínica",
    defaultServices: ["Consultas", "Avaliação"],
  },
  {
    id: "restaurante",
    label: "Restaurante",
    template: "food",
    priority: false,
    osm: ['["amenity"="restaurant"]', '["amenity"="fast_food"]'],
    googleQuery: "restaurante",
    defaultServices: ["Almoço", "Delivery"],
  },
  {
    id: "cafeteria",
    label: "Cafeteria / Padaria",
    template: "food",
    priority: false,
    osm: ['["amenity"="cafe"]', '["shop"="bakery"]', '["shop"="pastry"]'],
    googleQuery: "cafeteria",
    defaultServices: ["Cafés", "Lanches"],
  },
  {
    id: "oficina",
    label: "Oficina mecânica",
    template: "auto",
    priority: true,
    osm: ['["shop"="car_repair"]', '["shop"="tyres"]', '["shop"="motorcycle_repair"]', '["craft"="car_repair"]'],
    googleQuery: "oficina mecânica",
    defaultServices: ["Revisão", "Troca de óleo", "Freios e suspensão"],
  },
  {
    id: "petshop",
    label: "Pet shop / Veterinária",
    template: "services",
    priority: true,
    osm: ['["shop"="pet"]', '["shop"="pet_grooming"]', '["amenity"="veterinary"]'],
    googleQuery: "pet shop",
    defaultServices: ["Banho e tosa", "Consulta veterinária"],
  },
  {
    id: "servicos",
    label: "Serviços gerais",
    template: "services",
    priority: false,
    osm: ['["shop"="laundry"]', '["shop"="dry_cleaning"]', '["craft"="electrician"]', '["craft"="plumber"]', '["shop"="tailor"]'],
    googleQuery: "prestador de serviços",
    defaultServices: ["Orçamento sem compromisso"],
  },
];

export const segmentById = (id: string) => SEGMENTS.find((s) => s.id === id) ?? SEGMENTS[SEGMENTS.length - 1]!;

export const UF_DDD: Record<string, string> = {
  PE: "81", SP: "11", RJ: "21", MG: "31", BA: "71", CE: "85", PR: "41", RS: "51", SC: "48", GO: "62",
  DF: "61", PA: "91", AM: "92", MA: "98", PB: "83", RN: "84", AL: "82", SE: "79", PI: "86", ES: "27",
  MT: "65", MS: "67", TO: "63", RO: "69", AC: "68", AP: "96", RR: "95",
};

export const UF_NAME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};
