import { Elysia } from "elysia";
import { catalogRoutes } from "./catalog";
import { credentialRoutes, serviceRoutes } from "./service-routes";
import { userRoutes } from "./user-routes";

export { ensureIntegrationIndexes } from "../db/integration";

/** The JobIt integration (ADR 0003): public catalog, service API, public credentials, and the applicant's own routes. */
export const integrationRoutes = new Elysia({ name: "learnit-integration-all" })
  .use(catalogRoutes)
  .use(credentialRoutes)
  .use(serviceRoutes)
  .use(userRoutes);
