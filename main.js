const axios = require('axios');
const WebSocket = require('ws');

class RestClient {
    constructor(clientId, clientSecret, baseUrl) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.baseUrl = baseUrl;
        this.publicApiBase = '/api/v2/public';
        this.privateApiBase = '/api/v2/private';
        this.token = '';
    }

    async authenticate() {
        try {
            const response = await this.makeGetRequest(`${this.publicApiBase}/auth`, {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials'
            });

            if (!response.data.result) {
                throw new Error('Authentication failed');
            }

            this.token = response.data.result.access_token;
            console.log('Token:', this.token);
        } catch (error) {
            console.error('Error during authentication:', error.message);
            throw error;
        }
    }

    async buy(buyObj) {
        console.log("Buy Pbj: ");
        console.log(buyObj);
        this.ensureAuthenticated();

        try {
            const response = await this.makeGetRequest(`${this.privateApiBase}/buy`, buyObj);
            console.log('Buy response:', JSON.stringify(response.data, null, 4));
            return response.data.result;
        } catch (error) {
            console.error('Error during buy:', error.message);
            throw error;
        }
    }
    async modifyOrder(orderParams) {
        this.ensureAuthenticated();

        try {
            const response = await this.makeGetRequest(`${this.privateApiBase}/edit`, orderParams);
            console.log('Modify order response:', JSON.stringify(response.data, null, 4));
            return response.data.result;
        } catch (error) {
            console.error('Error during modifyOrder:', error.message);
            throw error;
        }
    }

    async cancelOrder(orderId) {
        this.ensureAuthenticated();

        try {
            const response = await this.makeGetRequest(`${this.privateApiBase}/cancel`, { order_id: orderId });
            console.log('Cancel order response:', JSON.stringify(response.data, null, 4));
            return response.data.result;
        } catch (error) {
            console.error('Error during cancelOrder:', error.message);
            throw error;
        }
    }

    async getOrderBook(instrumentName, depth = 5) {
        try {
            const response = await this.makeGetRequest(`${this.publicApiBase}/get_order_book`, {
                instrument_name: instrumentName,
                depth: depth.toString()
            });
            console.log('Order book:', JSON.stringify(response.data, null, 4));
            return response.data.result;
        } catch (error) {
            console.error('Error during getOrderBook:', error.message);
            throw error;
        }
    }

    async getPositions(positionParams) {
        this.ensureAuthenticated();

        try {
            const response = await this.makeGetRequest(`${this.privateApiBase}/get_positions`, positionParams);
            console.log('Positions:', JSON.stringify(response.data, null, 4));
            return response.data.result;
        } catch (error) {
            console.error('Error during getPositions:', error.message);
            throw error;
        }
    }

    async makeGetRequest(endpoint, params) {
        const url = `${this.baseUrl}${endpoint}`;
        console.log(url);
        const headers = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        return axios.get(url, {
            headers,
            params
        });
    }

    ensureAuthenticated() {
        if (!this.token) {
            throw new Error('Not authenticated. Please authenticate first.');
        }
    }
}
// WebSocket server implementation
class WebSocketServer {
    constructor(port, restClient) {
        this.port = port;
        this.restClient = restClient;
        this.clients = new Map();

        this.wss = new WebSocket.Server({ port: this.port });
        console.log(`WebSocket server started on ws://localhost:${this.port}`);

        this.wss.on('connection', (ws) => {
            ws.on('message', (message) => this.handleClientMessage(ws, message));
            ws.on('close', () => this.handleClientDisconnect(ws));
        });
    }

    async handleClientMessage(ws, message) {
        try {
            const data = JSON.parse(message);
            if (data.action === 'subscribe' && data.symbol) {
                const symbol = data.symbol;
                console.log(`Client subscribed to symbol: ${symbol}`);

                if (!this.clients.has(symbol)) {
                    this.clients.set(symbol, new Set());
                }
                this.clients.get(symbol).add(ws);

                // Start sending updates for this symbol
                this.sendOrderBookUpdates(symbol);
            } else {
                ws.send(JSON.stringify({ error: 'Invalid action or missing symbol' }));
            }
        } catch (error) {
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    }

    handleClientDisconnect(ws) {
        // Remove the client from all symbol subscriptions
        for (const [symbol, clientSet] of this.clients.entries()) {
            clientSet.delete(ws);
            if (clientSet.size === 0) {
                this.clients.delete(symbol); // No more clients subscribed to this symbol
            }
        }
        console.log('Client disconnected');
    }

    async sendOrderBookUpdates(symbol) {
        while (this.clients.has(symbol) && this.clients.get(symbol).size > 0) {
            try {
                const orderBook = await this.restClient.getOrderBook(symbol);
                const message = JSON.stringify({ symbol, orderBook });

                for (const client of this.clients.get(symbol)) {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                }

                // Delay to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 5000));
            } catch (error) {
                console.error(`Error fetching order book for ${symbol}:`, error.message);
            }
        }
    }
}

(async () => {
    const clientId = '2_jUHdow';
    const clientSecret = 'Bx1y0TyO6Wx5TGUmq96FNWaHvWZyxEiveAseaqc125U';
    const baseUrl = 'https://test.deribit.com';

    const client = new RestClient(clientId, clientSecret, baseUrl);

    try {
        await client.authenticate();

        // const buyObj = {
        //     amount: 40,
        //     instrument_name: 'BTC-PERPETUAL',
        //     type: 'limit',
        //     label: "market0000234",
        //     price: 10,
        // };
        // try {
        //     const buyResponse = await client.buy(buyObj);
        //     console.log('Order placed:', JSON.stringify(buyResponse, null, 4));
        // } catch (error) {
        //     console.error('Error in placing order:', error.message);
        // }

        // const modifyParams = {
        //     amount: 50,
        //     price: 5,
        //     order_id: "29287706664",
        // };

        // try {
        //     const modifyResponse = await client.modifyOrder(modifyParams);
        //     console.log('Order modified:', JSON.stringify(modifyResponse, null, 4));
        // } catch (error) {
        //     console.error('Error in modifying order:', error.message);
        // }

        // const orderId = '29287706664';
        // try {
        //     const cancelResponse = await client.cancelOrder(orderId);
        //     console.log('Order canceled:', JSON.stringify(cancelResponse, null, 4));
        // } catch (error) {
        //     console.error('Error in canceling order:', error.message);
        // }

        // try {
        //     const orderBookResponse = await client.getOrderBook('BTC-PERPETUAL', 5);
        //     console.log('Order Book:', JSON.stringify(orderBookResponse, null, 4));
        // } catch (error) {
        //     console.error('Error in getting order book:', error.message);
        // }

        // const positionParams = {
        //     currency: 'BTC',
        //     kind: 'future'
        // };

        // try {
        //     const positionsResponse = await client.getPositions(positionParams);
        //     console.log('Positions:', JSON.stringify(positionsResponse, null, 4));
        // } catch (error) {
        //     console.error('Error in getting positions:', error.message);
        // }


        const wsServer = new WebSocketServer(8080, client);
        console.log("WebSocket server started successfully.");
    } catch (error) {
        console.error('General error:', error.message);
    }
})();
