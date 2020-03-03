const { Pool } = require('pg');
const env = require('../env');

class DatabaseConnection {
    constructor(config) {
        this.config = config;
    }

    async getConnection() {
        if (!this.connection || !this.pool || (this.pool && this.pool.ended)) {
            this.pool = new Pool(this.config)
            this.connection = await this.pool.connect()
        }

        return this.connection
    }

    async query(queryString, paramsOrCallback, done) {
        const cnx = await this.getConnection();

        if (typeof paramsOrCallback === 'function') {
            return cnx.query(queryString, (err, resp) => {
                paramsOrCallback.call(undefined, err, resp)
            })
        } else {
            return cnx.query(queryString, paramsOrCallback, (err, resp) => {
                done.call(undefined, err, resp)
            })
        }
    }
}

const instance = new DatabaseConnection(env.db);

module.exports = instance;

