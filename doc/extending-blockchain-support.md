# Extending blockchain support

Support for additional blockchains and currency types can be added by implementing [Network](../src/blockchain/Network.js) and [Currency](../src/blockchain/Network.js) subclasses and placing them in `.network.js` and `.currency.js` files under [`src/blockchain`](../src/blockchain) folder.

See [`tron.network.js`](../src/blockchain/tron/tron.network.js) and [`trc20.currency.js`](../src/blockchain/tron/trc20/trc20.currency.js) as examples of network and currency implementations.
