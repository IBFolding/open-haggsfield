import {config} from 'dotenv';
import {launchReadiness} from '../server/readiness.mjs';
config({path:['.env.local','.env.supabase.local'],quiet:true});
const report=launchReadiness(process.env);console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--strict')&&!report.readyForPaidLaunch)process.exitCode=1;
