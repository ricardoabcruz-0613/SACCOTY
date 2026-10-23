import {getPool} from '../../server/database.mjs';
import {createHandler} from '../../server/app.mjs';
export default createHandler({getPool});
export const config={path:'/api/*'};
