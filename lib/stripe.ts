import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing STRIPE_SECRET_KEY')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20' as Stripe.LatestApiVersion,
    })
  }

  return stripeClient
}
