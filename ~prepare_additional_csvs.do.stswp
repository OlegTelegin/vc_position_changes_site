use "D:\revelio_data\list_of_17k_positions.dta", replace

keep role_k1000_v3 role_k50_v3 role_k10_v3
duplicates drop 
replace role_k50_v3 = "HR Coordinator (Operations)" if role_k50_v3 == "HR Coordinator" & role_k10_v3 == "Operations"
replace role_k50_v3 = "HR Coordinator (Public Service and Education)" if role_k50_v3 == "HR Coordinator" & role_k10_v3 == "Public Service and Education"
drop role_k10_v3

sort role_k50_v3

export delimited using "C:\Users\Krosha\cursor_projects\vc_position_changes_site\docs\data\mapping_between_50_and_1000_classifications.csv"


















