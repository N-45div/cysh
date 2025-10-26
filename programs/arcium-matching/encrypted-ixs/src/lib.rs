use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    // Represents an OTC order with encrypted details
    // All fields are encrypted to preserve privacy during matching
    pub struct Order {
        pub token_mint: u64,    // Token mint address (as u64 for simplicity in MPC)
        pub side: u8,           // Side: 0 = Buy, 1 = Sell
        pub amount: u64,        // Amount in token base units
        pub price: u64,         // Price in quote token base units (e.g., USDC)
        pub expiry: u64,        // Expiry timestamp (Unix seconds)
        pub trader_id: u64,     // Trader's pubkey (first 8 bytes as u64 for matching)
    }

    // Input containing both orders
    pub struct MatchOrdersInput {
        pub bid_token_mint: u64,
        pub bid_side: u8,
        pub bid_amount: u64,
        pub bid_price: u64,
        pub bid_expiry: u64,
        pub bid_trader_id: u64,
        pub ask_token_mint: u64,
        pub ask_side: u8,
        pub ask_amount: u64,
        pub ask_price: u64,
        pub ask_expiry: u64,
        pub ask_trader_id: u64,
    }

    // Result of matching two orders
    pub struct MatchResult {
        pub is_match: u8,           // Whether orders are compatible (1 = match, 0 = no match)
        pub matched_amount: u64,    // Matched amount (min of both orders)
        pub agreed_price: u64,      // Agreed price (from the maker/first order)
    }

    // Match two orders confidentially
    // Returns encrypted match result visible only to MXE and participants
    #[instruction]
    pub fn match_orders(input_ctxt: Enc<Shared, MatchOrdersInput>) -> Enc<Shared, MatchResult> {
        // Convert to arcis values
        let input = input_ctxt.to_arcis();
        
        let bid = Order {
            token_mint: input.bid_token_mint,
            side: input.bid_side,
            amount: input.bid_amount,
            price: input.bid_price,
            expiry: input.bid_expiry,
            trader_id: input.bid_trader_id,
        };
        
        let ask = Order {
            token_mint: input.ask_token_mint,
            side: input.ask_side,
            amount: input.ask_amount,
            price: input.ask_price,
            expiry: input.ask_expiry,
            trader_id: input.ask_trader_id,
        };

        // Check if orders are compatible:
        // 1. Same token
        // 2. Opposite sides (bid.side == 0 && ask.side == 1)
        // 3. Price compatibility: bid.price >= ask.price
        // 4. Both orders not expired (simplified: assume current_time passed separately)
        
        let same_token = if bid.token_mint == ask.token_mint { 1u8 } else { 0u8 };
        let opposite_sides = if bid.side == 0 && ask.side == 1 { 1u8 } else { 0u8 };
        let price_compatible = if bid.price >= ask.price { 1u8 } else { 0u8 };
        
        let is_match = if same_token == 1 && opposite_sides == 1 && price_compatible == 1 {
            1u8
        } else {
            0u8
        };

        // Matched amount is minimum of both orders
        let matched_amount = if bid.amount < ask.amount {
            bid.amount
        } else {
            ask.amount
        };

        // Agreed price is the ask price (maker price)
        let agreed_price = ask.price;

        let result = MatchResult {
            is_match,
            matched_amount,
            agreed_price,
        };

        // Return encrypted result shared between client and MXE
        input_ctxt.owner.from_arcis(result)
    }

    // Legacy add_together for testing (can be removed later)
    pub struct InputValues {
        v1: u8,
        v2: u8,
    }

    #[instruction]
    pub fn add_together(input_ctxt: Enc<Shared, InputValues>) -> Enc<Shared, u16> {
        let input = input_ctxt.to_arcis();
        let sum = input.v1 as u16 + input.v2 as u16;
        input_ctxt.owner.from_arcis(sum)
    }
}
