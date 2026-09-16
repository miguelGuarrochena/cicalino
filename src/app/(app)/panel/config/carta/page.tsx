import { redirect } from "next/navigation";

/* The menu moved to its own page. Old links and bookmarks land there. */
const ConfigCartaRedirect = () => {
  redirect("/panel/menu");
};

export default ConfigCartaRedirect;
