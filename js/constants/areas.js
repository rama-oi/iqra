import Enum from "../lib/enum.js";

// key <-> label: AREAS.get("backlog") === "Backlog", AREAS.get("Backlog") === "backlog"
export default new Enum({
  workarea: "Work Area",
  backlog: "Backlog",
  contributors: "Contributors",
});
