// Pure weather abbreviation defaults and text helpers. No DOM or storage access.

window.STEELER = window.STEELER || {};

function getDefaultAbbrDb(){
  // CL-081: Single-source-of-truth defaults (previous built-in Met Office shorthands)
  return {"version":1,"seededFromDefaults":true,"updatedAt":null,"groups":{"global":[],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]},"providers":{"metoffice":{"global":[{"id":"mo_001","from":"\\bSOUTH\\s+OR\\s+SOUTHEAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_002","from":"\\bSOUTH\\s+TO\\s+SOUTHEAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_003","from":"\\bSOUTH\\s+OR\\s+SOUTHWEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_004","from":"\\bSOUTH\\s+TO\\s+SOUTHWEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_005","from":"\\bWEST\\s+OR\\s+SOUTHWEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_006","from":"\\bWEST\\s+TO\\s+SOUTHWEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_007","from":"\\bSOUTH\\s+OR\\s+WEST\\b","to":"S/W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_008","from":"\\bSOUTHEAST\\s+OR\\s+VARIABLE\\b","to":"SE/VAR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_009","from":"\\bNORTH\\s+OR\\s+NORTHEAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_010","from":"\\bNORTH\\s+TO\\s+NORTHEAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_011","from":"\\bEAST\\s+OR\\s+SOUTHEAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_012","from":"\\bEAST\\s+TO\\s+SOUTHEAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_013","from":"\\bSOUTHERLY\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_014","from":"\\bNORTHERLY\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_015","from":"\\bEASTERLY\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_016","from":"\\bWESTERLY\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_017","from":"\\bSOUTHEASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_018","from":"\\bSOUTHWESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_019","from":"\\bNORTHEASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_020","from":"\\bNORTHWESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_021","from":"\\bOCCASIONALLY\\b","to":"OCC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_022","from":"\\bOCCASIONAL\\b","to":"OCC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_023","from":"\\bINCREASING\\b","to":"INC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_024","from":"\\bINCREASE\\b","to":"INC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_025","from":"\\bDECREASING\\b","to":"DEC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_026","from":"\\bDECREASE\\b","to":"DEC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_027","from":"\\bVEERING\\b","to":"V","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_028","from":"\\bBACKING\\b","to":"BK","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_029","from":"\\bBECOMING\\b","to":"→","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_030","from":"\\bTHEN\\b","to":"→","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_031","from":"\\bLATER\\b","to":"LTR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_032","from":"\\bAT\\s+FIRST\\b","to":"1ST","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_033","from":"\\bFOR\\s+A\\s+TIME\\b","to":"T","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_034","from":"\\bAT\\s+TIMES\\b","to":"TS","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_035","from":"\\bMAINLY\\b","to":"MLY","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_036","from":"\\bVARIABLE\\b","to":"VRB","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_037","from":"\\bLOCALLY\\b","to":"LOC","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_038","from":"\\bSWELL\\b","to":"SWL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_039","from":"\\bA\\s+TIME\\b","to":"T","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_040","from":"\\bUNTIL\\b","to":"UNTIL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_041","from":"\\bTILL\\b","to":"TIL","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_042","from":"\\bOVER\\s+NIGHT\\b","to":"O/N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_043","from":"\\bOVERNIGHT\\b","to":"O/N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_044","from":"\\bTHIS\\s+EVENING\\b","to":"EVE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_045","from":"\\bEVENING\\b","to":"EVE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_046","from":"\\bAFTER\\s+MIDNIGHT\\b","to":"AFT MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_047","from":"\\bAFTER\\s+DUSK\\b","to":"AFT DUSK","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_048","from":"\\bTOWARDS\\s+DAWN\\b","to":"TWD DAWN","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_049","from":"\\bBY\\s+MIDDAY\\b","to":"MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_050","from":"\\bMIDDAY\\b","to":"MID","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_051","from":"\\bMORNING\\b","to":"AM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_052","from":"\\bAFTERNOON\\b","to":"PM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_053","from":"\\bCLEARING\\b","to":"CLR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_054","from":"\\bSPREADING\\b","to":"SPR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_055","from":"\\bEASTWARDS\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_056","from":"\\bWESTWARDS\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_057","from":"\\bNORTHWARDS\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_058","from":"\\bSOUTHWARDS\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_059","from":"\\bMID\\s+CHANNEL\\b","to":"MID-CH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_060","from":"\\bGALE\\s+8\\b","to":"8","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_061","from":"\\bSEVERE\\s+GALE\\s+9\\b","to":"SEV 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_062","from":"\\bSTORM\\s+10\\b","to":"STM 10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_063","from":"\\bVIOLENT\\s+STORM\\s+11\\b","to":"VSTM 11","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_064","from":"\\bHURRICANE\\s+12\\b","to":"HURR 12","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_065","from":"\\bGOOD\\b","to":"G","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_066","from":"\\bPOOR\\b","to":"P","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_067","from":"\\bSOUTH\\s+(?:TO|OR)\\s+SOUTH\\s*EAST\\b","to":"S/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_068","from":"\\bSOUTH\\s+(?:TO|OR)\\s+SOUTH\\s*WEST\\b","to":"S/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_069","from":"\\bWEST\\s+TO\\s+SOUTH\\s*WEST\\b","to":"W/SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_070","from":"\\bEAST\\s+OR\\s+SOUTH\\s*EAST\\b","to":"E/SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_071","from":"\\bEAST\\s+OR\\s+NORTH\\s*EAST\\b","to":"E/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_072","from":"\\bNORTH\\s+(?:TO|OR)\\s+NORTH\\s*EAST\\b","to":"N/NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_073","from":"\\bNORTH\\s+(?:TO|OR)\\s+NORTH\\s*WEST\\b","to":"N/NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_074","from":"\\bWEST\\s+OR\\s+NORTH\\s*WEST\\b","to":"W/NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_075","from":"\\bSOUTH\\s+OF\\b","to":"S OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_076","from":"\\bNORTH\\s+OF\\b","to":"N OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_077","from":"\\bEAST\\s+OF\\b","to":"E OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_078","from":"\\bWEST\\s+OF\\b","to":"W OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_079","from":"\\bSOUTH\\s*EAST\\s+OF\\b","to":"SE OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_080","from":"\\bSOUTH\\s*WEST\\s+OF\\b","to":"SW OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_081","from":"\\bNORTH\\s*EAST\\s+OF\\b","to":"NE OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_082","from":"\\bNORTH\\s*WEST\\s+OF\\b","to":"NW OF","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_083","from":"\\bSOUTH\\s*EASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_084","from":"\\bSOUTH\\s*WESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_085","from":"\\bNORTH\\s*EASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_086","from":"\\bNORTH\\s*WESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_087","from":"\\bSOUTH\\s*EAST\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_088","from":"\\bSOUTH\\s*WEST\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_089","from":"\\bNORTH\\s*EAST\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_090","from":"\\bNORTH\\s*WEST\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_091","from":"\\bSOUTHERLY\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_092","from":"\\bNORTHEASTERLY\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_093","from":"\\bNORTHWESTERLY\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_094","from":"\\bSOUTHEASTERLY\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_095","from":"\\bSOUTHWESTERLY\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_096","from":"\\bSOUTHEAST\\b","to":"SE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_097","from":"\\bSOUTHWEST\\b","to":"SW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_098","from":"\\bNORTHEAST\\b","to":"NE","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_099","from":"\\bNORTHWEST\\b","to":"NW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_100","from":"\\bSOUTH\\b","to":"S","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_101","from":"\\bNORTH\\b","to":"N","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_102","from":"\\bEAST\\b","to":"E","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_103","from":"\\bWEST\\b","to":"W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_104","from":"\\bMID[- ]CHANNEL\\b","to":"MID-CH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_105","from":"\\bFAR\\s+W(?:EST)?\\b","to":"FAR W","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_106","from":"\\bIN\\s+THE\\s+AM\\b","to":"AM","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_107","from":"\\bTOMORROW\\b","to":"TMW","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_108","from":"\\bFROM\\b","to":"FR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_109","from":"\\bHEAVY\\b","to":"HVY","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_110","from":"\\bISOLATED\\b","to":"ISO","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_111","from":"\\bCLEARING\\b","to":"CLR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_112","from":"\\bSPREADING\\b","to":"SPR","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_113","from":"\\bTHUNDERY\\b","to":"TH","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_114","from":"\\bSEV\\s+9\\s+OR\\s+STM\\s+10\\b","to":"9/10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_115","from":"\\bSEV\\s+9\\s+OR\\s+STORM\\s+10\\b","to":"9/10","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_116","from":"\\bOCC\\s+SEV\\s+9\\b","to":"OCC 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_117","from":"\\bBUT\\s+OCC\\s+SEV\\s+9\\b","to":"BUT OCC 9","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_118","from":"\\b(\\d{1,2})\\s+OR\\s+(\\d{1,2})\\b","to":"$1/$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_119","from":"\\b([A-Z]{1,3})\\s+OR\\s+([A-Z]{1,3})\\b","to":"$1/$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_120","from":"\\bTO\\b","to":"-","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_121","from":"\\b(\\d{1,2})\\s*-\\s*(\\d{1,2})\\b","to":"$1-$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_122","from":"\\b(\\d{1,2})\\s*-\\s*GALE\\s*(\\d{1,2})\\b","to":"$1-$2","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_123","from":"\\bPERHAPS\\s+([A-Z]{1,3})\\b","to":"$1?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_124","from":"\\bPERHAPS\\s+([A-Z]{1,3}\\/[A-Z]{1,3})\\b","to":"$1?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_125","from":"\\bPERHAPS\\b","to":"?","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_126","from":"\\s+\\.","to":".","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_127","from":"\\s+,","to":",","mode":"regex","enabled":true,"flags":"g"},{"id":"mo_128","from":"\\s{2,}","to":" ","mode":"regex","enabled":true,"flags":"g"}],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]}},"meteofrance":{"global":[],"byCategory":{"wind":[],"sea":[],"weather":[],"vis":[],"swl":[]}}}}};
}

function applyAbbrRules(text, rules){
  let s = String(text ?? "");
  (rules || []).forEach(rule => {
    try{
      if (!rule || rule.enabled === false) return;
      const from = String(rule.from ?? "");
      const to   = String(rule.to   ?? "");
      if (!from) return;

      const mode = (rule.mode || "plain").toLowerCase();

      if (mode === "regex"){
        // Default to case-insensitive global matching so rules work with native-case forecasts
        let flags = rule.flags ? String(rule.flags) : "gi";
        if (!flags.includes("g")) flags += "g";
        if (!flags.includes("i")) flags += "i";
        const re = new RegExp(from, flags);
        s = s.replace(re, to);
      } else if (mode === "word"){
        const re = new RegExp("\\b" + _escapeRegExp(from) + "\\b", "gi");
        s = s.replace(re, to);
      } else { // plain
        const re = new RegExp(_escapeRegExp(from), 'gi');
        s = s.replace(re, to);
      }
    }catch(e){
      // ignore bad rule
    }
  });
  return s;
}

function stripMetOfficeCopyright(raw){
  if(!raw) return raw;
  // Remove the copyright footer and URLs if present
  return raw
    .replace(/\[©\s*Crown\s*copyright\][\s\S]*?===\s*End\s*Met\s*Office\s*===/i, "=== End Met Office ===")
    .replace(/\[©\s*CROWN\s*COPYRIGHT\][\s\S]*?===\s*End\s*Met\s*Office\s*===/i, "=== End Met Office ===")
    .replace(/\[©\s*CROWN\s*COPYRIGHT\][\s\S]*$/i, "")
    .trim();
}

function abbreviateMetOfficeText(t){
  let s = toUpperSafe(normalizeSpaces(t));

  // Common phrase reductions (order matters)
  const reps = [
    [/\bSOUTH\s+OR\s+SOUTHEAST\b/g, "S/SE"],
    [/\bSOUTH\s+TO\s+SOUTHEAST\b/g, "S/SE"],
    [/\bSOUTH\s+OR\s+SOUTHWEST\b/g, "S/SW"],
    [/\bSOUTH\s+TO\s+SOUTHWEST\b/g, "S/SW"],
    [/\bWEST\s+OR\s+SOUTHWEST\b/g, "W/SW"],
    [/\bWEST\s+TO\s+SOUTHWEST\b/g, "W/SW"],
    [/\bSOUTH\s+OR\s+WEST\b/g, "S/W"],
    [/\bSOUTHEAST\s+OR\s+VARIABLE\b/g, "SE/VAR"],
    [/\bNORTH\s+OR\s+NORTHEAST\b/g, "N/NE"],
    [/\bNORTH\s+TO\s+NORTHEAST\b/g, "N/NE"],
    [/\bEAST\s+OR\s+SOUTHEAST\b/g, "E/SE"],
    [/\bEAST\s+TO\s+SOUTHEAST\b/g, "E/SE"],
    [/\bSOUTHERLY\b/g, "S"],
    [/\bNORTHERLY\b/g, "N"],
    [/\bEASTERLY\b/g, "E"],
    [/\bWESTERLY\b/g, "W"],
    [/\bSOUTHEASTERLY\b/g, "SE"],
    [/\bSOUTHWESTERLY\b/g, "SW"],
    [/\bNORTHEASTERLY\b/g, "NE"],
    [/\bNORTHWESTERLY\b/g, "NW"],
  ];
  reps.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Words/verbs
  const reps2 = [
    [/\bOCCASIONALLY\b/g, "OCC"],
    [/\bOCCASIONAL\b/g, "OCC"],
    [/\bINCREASING\b/g, "INC"],
    [/\bINCREASE\b/g, "INC"],
    [/\bDECREASING\b/g, "DEC"],
    [/\bDECREASE\b/g, "DEC"],
    [/\bVEERING\b/g, "V"],
    [/\bBACKING\b/g, "BK"],
    [/\bBECOMING\b/g, "→"],
    [/\bTHEN\b/g, "→"],
    [/\bLATER\b/g, "LTR"],
    [/\bAT\s+FIRST\b/g, "1ST"],
    [/\bFOR\s+A\s+TIME\b/g, "T"],
    [/\bAT\s+TIMES\b/g, "TS"],
    [/\bMAINLY\b/g, "MLY"],
    [/\bVARIABLE\b/g, "VRB"],
    [/\bLOCALLY\b/g, "LOC"],
    [/\bSWELL\b/g, "SWL"],
    [/\bA\s+TIME\b/g, "T"],
    [/\bUNTIL\b/g, "UNTIL"],
    [/\bTILL\b/g, "TIL"],
    [/\bOVER\s+NIGHT\b/g, "O/N"],
    [/\bOVERNIGHT\b/g, "O/N"],
    [/\bTHIS\s+EVENING\b/g, "EVE"],
    [/\bEVENING\b/g, "EVE"],
    [/\bAFTER\s+MIDNIGHT\b/g, "AFT MID"],
    [/\bAFTER\s+DUSK\b/g, "AFT DUSK"],
    [/\bTOWARDS\s+DAWN\b/g, "TWD DAWN"],
    [/\bBY\s+MIDDAY\b/g, "MID"],
    [/\bMIDDAY\b/g, "MID"],
    [/\bMORNING\b/g, "AM"],
    [/\bAFTERNOON\b/g, "PM"],
    [/\bCLEARING\b/g, "CLR"],
    [/\bSPREADING\b/g, "SPR"],
    [/\bEASTWARDS\b/g, "E"],
    [/\bWESTWARDS\b/g, "W"],
    [/\bNORTHWARDS\b/g, "N"],
    [/\bSOUTHWARDS\b/g, "S"],
    [/\bMID\s+CHANNEL\b/g, "MID-CH"],
  ];
  reps2.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Beaufort descriptors
  s = s.replace(/\bGALE\s+8\b/g, "8");
  s = s.replace(/\bSEVERE\s+GALE\s+9\b/g, "SEV 9");
  s = s.replace(/\bSTORM\s+10\b/g, "STM 10");
  s = s.replace(/\bVIOLENT\s+STORM\s+11\b/g, "VSTM 11");
  s = s.replace(/\bHURRICANE\s+12\b/g, "HURR 12");

  // Sea state words
  const sea = [
    [/\bVERY\s+ROUGH\b/g, "VR"],
    [/\bRATHER\s+ROUGH\b/g, "RR"],
    [/\bROUGH\b/g, "R"],
    [/\bMODERATE\b/g, "M"],
    [/\bSLIGHT\b/g, "SL"],
    [/\bSMOOTH\b/g, "SM"],
  ];
  sea.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Weather words
  const wx = [
    [/\bSHOWERS\b/g, "SH"],
    [/\bSHOWER\b/g, "SH"],
    [/\bRAIN\b/g, "R"],
    [/\bDRIZZLE\b/g, "DZ"],
    [/\bFAIR\b/g, "F"],
    [/\bMIST\b/g, "MST"],
    [/\bFOG\b/g, "FG"],
    [/\bTHUNDER\b/g, "TH"],
    [/\bTHUNDERSTORM\b/g, "TH"],
  ];
  wx.forEach(([re, rep]) => { s = s.replace(re, rep); });

  // Visibility words
  s = s.replace(/\bGOOD\b/g, "G");
  s = s.replace(/\bPOOR\b/g, "P");
  // Moderate in VIS context is ambiguous; keep as M.

  // Compass/direction abbreviations (apply BEFORE converting TO -> -)
  // Common combined phrases
  s = s.replace(/\bSOUTH\s+(?:TO|OR)\s+SOUTH\s*EAST\b/g, "S/SE");
  s = s.replace(/\bSOUTH\s+(?:TO|OR)\s+SOUTH\s*WEST\b/g, "S/SW");
  s = s.replace(/\bWEST\s+TO\s+SOUTH\s*WEST\b/g, "W/SW");
  s = s.replace(/\bEAST\s+OR\s+SOUTH\s*EAST\b/g, "E/SE");
  s = s.replace(/\bEAST\s+OR\s+NORTH\s*EAST\b/g, "E/NE");
  s = s.replace(/\bNORTH\s+(?:TO|OR)\s+NORTH\s*EAST\b/g, "N/NE");
  s = s.replace(/\bNORTH\s+(?:TO|OR)\s+NORTH\s*WEST\b/g, "N/NW");
  s = s.replace(/\bWEST\s+OR\s+NORTH\s*WEST\b/g, "W/NW");

  // Geographic "X OF" phrases first (so SOUTH doesn't become S too early)
  s = s.replace(/\bSOUTH\s+OF\b/g, "S OF");
  s = s.replace(/\bNORTH\s+OF\b/g, "N OF");
  s = s.replace(/\bEAST\s+OF\b/g, "E OF");
  s = s.replace(/\bWEST\s+OF\b/g, "W OF");
  s = s.replace(/\bSOUTH\s*EAST\s+OF\b/g, "SE OF");
  s = s.replace(/\bSOUTH\s*WEST\s+OF\b/g, "SW OF");
  s = s.replace(/\bNORTH\s*EAST\s+OF\b/g, "NE OF");
  s = s.replace(/\bNORTH\s*WEST\s+OF\b/g, "NW OF");

  // Standalone compass words
  s = s.replace(/\bSOUTH\s*EASTERLY\b/g, "SE");
  s = s.replace(/\bSOUTH\s*WESTERLY\b/g, "SW");
  s = s.replace(/\bNORTH\s*EASTERLY\b/g, "NE");
  s = s.replace(/\bNORTH\s*WESTERLY\b/g, "NW");
  s = s.replace(/\bSOUTH\s*EAST\b/g, "SE");
  s = s.replace(/\bSOUTH\s*WEST\b/g, "SW");
  s = s.replace(/\bNORTH\s*EAST\b/g, "NE");
  s = s.replace(/\bNORTH\s*WEST\b/g, "NW");
  s = s.replace(/\bSOUTHERLY\b/g, "S");
  s = s.replace(/\bNORTHEASTERLY\b/g, "NE");
  s = s.replace(/\bNORTHWESTERLY\b/g, "NW");
  s = s.replace(/\bSOUTHEASTERLY\b/g, "SE");
  s = s.replace(/\bSOUTHWESTERLY\b/g, "SW");
  s = s.replace(/\bSOUTHEAST\b/g, "SE");
  s = s.replace(/\bSOUTHWEST\b/g, "SW");
  s = s.replace(/\bNORTHEAST\b/g, "NE");
  s = s.replace(/\bNORTHWEST\b/g, "NW");
  s = s.replace(/\bSOUTH\b/g, "S");
  s = s.replace(/\bNORTH\b/g, "N");
  s = s.replace(/\bEAST\b/g, "E");
  s = s.replace(/\bWEST\b/g, "W");

  // Extra Met Office / Channel Islands vocab tweaks
  s = s.replace(/\bMID[- ]CHANNEL\b/g, "MID-CH");
  s = s.replace(/\bFAR\s+W(?:EST)?\b/g, "FAR W");
  s = s.replace(/\bIN\s+THE\s+AM\b/g, "AM");
  s = s.replace(/\bTOMORROW\b/g, "TMW");
  s = s.replace(/\bFROM\b/g, "FR");
  s = s.replace(/\bHEAVY\b/g, "HVY");
  s = s.replace(/\bISOLATED\b/g, "ISO");
  s = s.replace(/\bCLEARING\b/g, "CLR");
  s = s.replace(/\bSPREADING\b/g, "SPR");
  s = s.replace(/\bTHUNDERY\b/g, "TH");

  // Reduce Beaufort descriptors when paired (e.g. "SEV 9 OR STM 10" -> "9/10"; "OCC SEV 9" -> "OCC 9")
  s = s.replace(/\bSEV\s+9\s+OR\s+STM\s+10\b/g, "9/10");
  s = s.replace(/\bSEV\s+9\s+OR\s+STORM\s+10\b/g, "9/10");
  s = s.replace(/\bOCC\s+SEV\s+9\b/g, "OCC 9");
  s = s.replace(/\bBUT\s+OCC\s+SEV\s+9\b/g, "BUT OCC 9");

  // Replace "OR" with "/" in common abbreviated constructions (numbers and short tokens)
  s = s.replace(/\b(\d{1,2})\s+OR\s+(\d{1,2})\b/g, "$1/$2");
  s = s.replace(/\b([A-Z]{1,3})\s+OR\s+([A-Z]{1,3})\b/g, "$1/$2");

  // Replace connector
  s = s.replace(/\bTO\b/g, "-"); // note: later we restore "TO" where needed by numeric rules

  // Numeric ranges: "6 - 8" or "6 - 7" already ok. Handle "6 - 8" tokens from TO->-
  s = s.replace(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g, "$1-$2");
  s = s.replace(/\b(\d{1,2})\s*-\s*GALE\s*(\d{1,2})\b/g, "$1-$2");

  // Question mark for PERHAPS
  s = s.replace(/\bPERHAPS\s+([A-Z]{1,3})\b/g, "$1?");
  s = s.replace(/\bPERHAPS\s+([A-Z]{1,3}\/[A-Z]{1,3})\b/g, "$1?");
  s = s.replace(/\bPERHAPS\b/g, "?");

  // Clean punctuation spacing
  s = s.replace(/\s+\./g, ".").replace(/\s+,/g, ",");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

window.STEELER.weatherAbbreviations = {
  getDefaultAbbrDb: typeof getDefaultAbbrDb !== "undefined" ? getDefaultAbbrDb : undefined,
  applyAbbrRules: typeof applyAbbrRules !== "undefined" ? applyAbbrRules : undefined,
  stripMetOfficeCopyright: typeof stripMetOfficeCopyright !== "undefined" ? stripMetOfficeCopyright : undefined,
  abbreviateMetOfficeText: typeof abbreviateMetOfficeText !== "undefined" ? abbreviateMetOfficeText : undefined
};
