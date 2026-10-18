import {runtime} from '../server/runtime.mjs';
import {hostedHandler} from '../server/hosted.mjs';
export const config={api:{bodyParser:false}};
export default hostedHandler(runtime);
