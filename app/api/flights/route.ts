import { NextRequest, NextResponse } from 'next/server';
import { CONTINENT_DESTINATIONS, pickDestination, getFlightPrice } from '@/lib/flightPrice';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const continent = searchParams.get('continent');
  const origin = searchParams.get('origin');
  const excludeParam = searchParams.get('exclude') ?? '';

  if (!continent || !origin) {
    return NextResponse.json({ error: 'continent and origin required' }, { status: 400 });
  }
  if (!(continent in CONTINENT_DESTINATIONS)) {
    return NextResponse.json({ error: 'unknown continent' }, { status: 400 });
  }

  const exclude = excludeParam.split(',').map(s => s.trim()).filter(Boolean);
  const destination_iata = pickDestination(continent, origin, exclude);

  if (!destination_iata) {
    return NextResponse.json({ price_usd: null, destination_iata: null, provider: 'no-destination' });
  }

  const { price_usd, provider } = await getFlightPrice(origin, destination_iata);
  return NextResponse.json({ price_usd, destination_iata, provider });
}
