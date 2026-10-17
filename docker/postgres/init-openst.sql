-- The production PostgresCluster gives OpenST its own database. Keep the
-- compose stack honest so admin tests cannot accidentally rely on an openst
-- schema inside the portfoliost database.
CREATE DATABASE openst OWNER portfoliost;
