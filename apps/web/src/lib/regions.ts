/** World regions for quick country selection (ISO 3166-1 alpha-2 codes). */
export const REGIONS: { label: string; codes: string[] }[] = [
  {
    label: "Europe",
    codes:
      `AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS
IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK`.split(
        /\s+/,
      ),
  },
  {
    label: "Middle East",
    codes: "AE BH EG IL IQ IR JO KW LB OM PS QA SA SY TR YE".split(" "),
  },
  {
    label: "North America",
    codes: "BM CA GL MX PM US".split(" "),
  },
  {
    label: "Latin America & Caribbean",
    codes:
      `AG AI AR AW BB BL BO BQ BR BS BZ CL CO CR CU CW DM DO EC FK GD GF GP GT GY HN HT
JM KN KY LC MF MQ MS NI PA PE PR PY SR SV SX TC TT UY VC VE VG VI`.split(/\s+/),
  },
  {
    label: "Asia & Pacific",
    codes:
      `AF AM AS AU AZ BD BN BT CC CK CN CX FJ FM GE GU HK ID IN IO JP KG KH KI KP KR KZ
LA LK MH MM MN MO MP MV MY NC NF NP NR NU NZ PF PG PH PK PN PW SB SG TH TJ TK TL TM TO TV TW
UM UZ VN VU WF WS`.split(/\s+/),
  },
  {
    label: "Africa",
    codes:
      `AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EH ER ET GA GH GM GN GQ GW KE KM LR LS LY
MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW`.split(
        /\s+/,
      ),
  },
];
