import { TargetprocessClient } from "./client";
import { printTable, printJson, hasJsonFlag } from "./format";
import { TpProject } from "@shared/targetprocess";

async function main(): Promise<void> {
  console.log("--- Estrazione Progetti Targetprocess ---");
  try {
    const client = new TargetprocessClient();
    const projects = await client.getProjectsAssignedToMe();

    if (projects.length === 0) {
      console.log("Nessun progetto trovato assegnato a te.");
      return;
    }

    if (hasJsonFlag()) {
      printJson(projects);
      return;
    }

    console.log(`\nFound ${projects.length} projects:\n`);

    printTable<TpProject>(projects, [
      { header: "ID", width: 8, value: (p) => String(p.id) },
      {
        header: "STATO",
        width: 8,
        value: (p) => (p.isActive ? "Attivo" : "Inattivo"),
      },
      { header: "NOME PROGETTO", width: 50, value: (p) => p.name },
    ]);

    console.log("\n--- Fine Estrazione ---");
  } catch (error) {
    console.error("\nErrore durante l'esecuzione:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
