/**
 * The salary survey's questions: one catalog for the form, the server-side
 * validation, the results and the open dataset. Keys are stored in the
 * database, so never rename one; add new options at the end instead.
 */

type Option = { readonly value: string; readonly label: string };

const options = <const T extends readonly Option[]>(list: T) => list;

export const ROLES = options([
  { value: "backend", label: "Backend" },
  { value: "frontend", label: "Frontend" },
  { value: "fullstack", label: "Fullstack" },
  { value: "mobile", label: "Mobile" },
  { value: "data", label: "Datos, IA o ML" },
  { value: "qa", label: "QA y testing" },
  { value: "devops", label: "DevOps, SRE o infra" },
  { value: "seguridad", label: "Seguridad" },
  { value: "diseno", label: "Diseño UX/UI" },
  { value: "producto", label: "Producto" },
  { value: "gestion", label: "Gestión de equipos" },
  { value: "otro", label: "Otro" },
]);

export const SENIORITIES = options([
  { value: "trainee", label: "Trainee o pasante" },
  { value: "junior", label: "Junior" },
  { value: "semisenior", label: "Semi senior" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead, staff o principal" },
  { value: "gerencia", label: "Gerencia o dirección" },
]);

export const EXPERIENCE = options([
  { value: "menos-1", label: "Menos de 1 año" },
  { value: "1-3", label: "1 a 3 años" },
  { value: "3-5", label: "3 a 5 años" },
  { value: "5-10", label: "5 a 10 años" },
  { value: "mas-10", label: "Más de 10 años" },
]);

export const STACKS = options([
  { value: "js-ts", label: "JavaScript / TypeScript" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "dotnet", label: ".NET / C#" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "go", label: "Go" },
  { value: "elixir", label: "Elixir / Erlang" },
  { value: "mobile-nativo", label: "Kotlin / Swift" },
  { value: "rust", label: "Rust" },
  { value: "datos", label: "SQL y datos" },
  { value: "cloud", label: "Cloud e infraestructura" },
  { value: "otro", label: "Otro" },
]);

export const MAX_STACKS = 3;

export const EMPLOYERS = options([
  { value: "empresa-uy", label: "Empresa uruguaya" },
  { value: "empresa-exterior", label: "Empresa del exterior con contrato local" },
  { value: "cliente-exterior", label: "Cliente del exterior, como independiente" },
  { value: "cliente-local", label: "Cliente local, como independiente" },
  { value: "propia", label: "Empresa propia" },
]);

export const CONTRACTS = options([
  { value: "dependencia", label: "Relación de dependencia" },
  { value: "unipersonal", label: "Unipersonal" },
  { value: "sas", label: "SAS" },
  { value: "sociedad", label: "SRL u otra sociedad" },
  { value: "monotributo", label: "Monotributo" },
  { value: "otra", label: "Otra" },
]);

export const MODALITIES = options([
  { value: "remoto", label: "Remoto" },
  { value: "hibrido", label: "Híbrido" },
  { value: "presencial", label: "Presencial" },
]);

export const DEPARTMENTS = options([
  { value: "montevideo", label: "Montevideo" },
  { value: "canelones", label: "Canelones" },
  { value: "maldonado", label: "Maldonado" },
  { value: "colonia", label: "Colonia" },
  { value: "san-jose", label: "San José" },
  { value: "paysandu", label: "Paysandú" },
  { value: "salto", label: "Salto" },
  { value: "rivera", label: "Rivera" },
  { value: "tacuarembo", label: "Tacuarembó" },
  { value: "rocha", label: "Rocha" },
  { value: "florida", label: "Florida" },
  { value: "lavalleja", label: "Lavalleja" },
  { value: "soriano", label: "Soriano" },
  { value: "rio-negro", label: "Río Negro" },
  { value: "durazno", label: "Durazno" },
  { value: "cerro-largo", label: "Cerro Largo" },
  { value: "artigas", label: "Artigas" },
  { value: "treinta-y-tres", label: "Treinta y Tres" },
  { value: "flores", label: "Flores" },
]);

export const CURRENCIES = options([
  { value: "UYU", label: "Pesos uruguayos" },
  { value: "USD", label: "Dólares" },
]);

export const GENDERS = options([
  { value: "mujer", label: "Mujer" },
  { value: "varon", label: "Varón" },
  { value: "no-binario", label: "No binario" },
  { value: "prefiero-no-decir", label: "Prefiero no decir" },
]);

export const EDUCATION = options([
  { value: "secundaria", label: "Secundaria" },
  { value: "terciario-en-curso", label: "Terciario en curso" },
  { value: "terciario", label: "Terciario completo (técnico o carrera corta)" },
  { value: "grado", label: "Universitario de grado completo" },
  { value: "posgrado", label: "Posgrado" },
  { value: "autodidacta", label: "Autodidacta o bootcamp" },
  { value: "prefiero-no-decir", label: "Prefiero no decir" },
]);

/**
 * Monthly nominal amounts we accept, per currency. Wide on purpose: they only
 * catch typos (an extra zero, an annual figure), not "unusual" salaries.
 */
export const AMOUNT_RANGE = {
  UYU: { min: 15_000, max: 2_000_000 },
  USD: { min: 300, max: 50_000 },
} as const;

export const HOURS_RANGE = { min: 1, max: 80 } as const;

/** "Para el exterior" vs local, derived from who you work for */
export const MARKETS = options([
  { value: "exterior", label: "Para el exterior" },
  { value: "local", label: "Para Uruguay" },
]);

export const marketOf = (employer: string) =>
  employer === "empresa-exterior" || employer === "cliente-exterior" ? "exterior" : "local";

/** Groups smaller than this never show up in results or the dataset */
export const MIN_GROUP_SIZE = 10;

export type Currency = (typeof CURRENCIES)[number]["value"];

export const values = <T extends readonly Option[]>(list: T) =>
  list.map((option) => option.value) as unknown as [T[number]["value"], ...T[number]["value"][]];

export const labelOf = (list: readonly Option[], value: string) =>
  list.find((option) => option.value === value)?.label ?? value;
