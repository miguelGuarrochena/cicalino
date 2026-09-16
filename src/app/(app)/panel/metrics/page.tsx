import { redirect } from "next/navigation";

const MetricsRedirect = () => {
  redirect("/panel/config/metricas");
};

export default MetricsRedirect;
