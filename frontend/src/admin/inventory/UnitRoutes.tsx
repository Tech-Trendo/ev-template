import PDIDetail from "./PDIDetail";
import PDIForm from "./PDIForm";
import UnitProfile from "./UnitProfile";

/**
 * Sub-router for `units/...` paths. Called only when page starts with "units/".
 * Supported shapes:
 *   units/:id
 *   units/:id/pdi/new
 *   units/:id/pdi/:pdiId
 *   units/:id/pdi/:pdiId/edit
 */
export default function UnitRoutes({
  page,
  onNavigate,
}: {
  page: string;
  onNavigate: (p: string) => void;
}) {
  const parts = page.split("/");
  const unitId = parts[1] ?? "";
  if (!unitId) {
    onNavigate("units");
    return null;
  }
  if (parts[2] === "pdi" && parts[3] === "new") {
    return <PDIForm unitId={unitId} pdiId="new" initialType="PDI" onNavigate={onNavigate} />;
  }
  if (parts[2] === "vei" && parts[3] === "new") {
    return <PDIForm unitId={unitId} pdiId="new" initialType="VEI" onNavigate={onNavigate} />;
  }
  if (parts[2] === "pdi" && parts[3] && parts[4] === "edit") {
    return <PDIForm unitId={unitId} pdiId={parts[3]} initialType="PDI" onNavigate={onNavigate} />;
  }
  if (parts[2] === "vei" && parts[3] && parts[4] === "edit") {
    return <PDIForm unitId={unitId} pdiId={parts[3]} initialType="VEI" onNavigate={onNavigate} />;
  }
  if ((parts[2] === "pdi" || parts[2] === "vei") && parts[3]) {
    return <PDIDetail unitId={unitId} pdiId={parts[3]} onNavigate={onNavigate} />;
  }
  if (parts[2] === "reports") {
    onNavigate(`units/${unitId}`);
    return null;
  }
  return <UnitProfile unitId={unitId} onNavigate={onNavigate} />;
}
