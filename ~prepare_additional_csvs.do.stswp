use "D:\revelio_data\list_of_17k_positions.dta", replace

keep role_k1000_v3 role_k50_v3 role_k10_v3
duplicates drop 
replace role_k50_v3 = "HR Coordinator (Operations)" if role_k50_v3 == "HR Coordinator" & role_k10_v3 == "Operations"
replace role_k50_v3 = "HR Coordinator (Public Service and Education)" if role_k50_v3 == "HR Coordinator" & role_k10_v3 == "Public Service and Education"
drop role_k10_v3

sort role_k50_v3

export delimited using "C:\Users\Krosha\cursor_projects\vc_position_changes_site\docs\data\mapping_between_50_and_1000_classifications.csv"




use "D:\revelio_data\list_of_17k_positions.dta", replace
keep role_k1000_v3 role_k17000_v3

merge 1:1 role_k17000_v3 using "D:\revelio_data\list_of_17k_positions_w_scores.dta"
drop _merge
sort role_k1000_v3

export delimited using "C:\Users\Krosha\cursor_projects\vc_position_changes_site\docs\data\cc_ser_scores_for_1000_positions.csv"



use "C:\Users\Krosha\cursor_projects\vc_position_changes\output\results_together\regime_all_obs\vc_did_weightshare_results.dta", replace

keep if var == "L0_treat" | var == "L1_treat" | var == "L2_treat" | var == "L3_treat" | var == "L4_treat" | var == "L5_treat"
keep var coef position_k1000_classification
collapse (max) coef, by(position_k1000_classification)

xtile max_coef_pctile = coef, nq(20)

export delimited using "C:\Users\Krosha\cursor_projects\vc_position_changes_site\docs\data\max_coef_pctile_for_1000_positions.csv"





* forvalues i = 1/1004 {
forvalues i = 1/1004 {
use weight total_employment using "F:\revelio_data\individual_positions_parts_analysis\needed_parts_collapsed_1000_roles_by_roles_w_info_restricted\part_`i'.dta", replace

gen empl_share = weight / total_employment
replace empl_share = 0 if empl_share == .
gen position_k1000_classification = `i'
collapse (mean) empl_share, by(position_k1000_classification)

save "F:\revelio_data\individual_positions_parts_analysis\needed_parts_collapsed_1000_roles_position_av_shares\part_`i'.dta", replace
}



use "F:\revelio_data\individual_positions_parts_analysis\needed_parts_collapsed_1000_roles_position_av_shares\part_1.dta", replace
forvalues i = 2/1004 {
append using "F:\revelio_data\individual_positions_parts_analysis\needed_parts_collapsed_1000_roles_position_av_shares\part_`i'.dta"
}

xtile position_popularity_pctile = empl_share, nq(20)

export delimited using "C:\Users\Krosha\cursor_projects\vc_position_changes_site\docs\data\position_popularity_pctile_for_1000_positions.csv"












