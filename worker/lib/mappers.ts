import type { DepartmentCode, EventType, Golf, GolfEvent } from '../../shared/types';

export interface GolfRowDb {
  id: number;
  slug: string;
  name: string;
  department: string;
  city: string;
  postcode: string | null;
  lat: number | null;
  lng: number | null;
  holes: number | null;
  website: string | null;
  phone: string | null;
  upcoming_count?: number;
}

export interface EventRowDb {
  id: number;
  golf_id: number;
  golf_name: string;
  golf_city: string;
  department: string;
  lat: number | null;
  lng: number | null;
  title: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  type: string;
  format: string | null;
  eligibility: string | null;
  price: string | null;
  registration_url: string | null;
  info_url: string | null;
  description: string | null;
  status: string;
  updated_at: string;
}

export function toGolf(r: GolfRowDb): Golf {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    department: r.department as DepartmentCode,
    city: r.city,
    postcode: r.postcode,
    lat: r.lat,
    lng: r.lng,
    holes: r.holes,
    website: r.website,
    phone: r.phone,
    ...(r.upcoming_count !== undefined ? { upcomingCount: r.upcoming_count } : {}),
  };
}

export function toEvent(r: EventRowDb): GolfEvent {
  return {
    id: r.id,
    golfId: r.golf_id,
    golfName: r.golf_name,
    golfCity: r.golf_city,
    department: r.department as DepartmentCode,
    lat: r.lat,
    lng: r.lng,
    title: r.title,
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: r.start_time,
    type: r.type as EventType,
    format: r.format,
    eligibility: r.eligibility,
    price: r.price,
    registrationUrl: r.registration_url,
    infoUrl: r.info_url,
    description: r.description,
    status: r.status as GolfEvent['status'],
    updatedAt: r.updated_at,
  };
}

export const EVENT_SELECT = `
  SELECT e.id, e.golf_id, g.name AS golf_name, g.city AS golf_city, g.department, g.lat, g.lng,
         e.title, e.start_date, e.end_date, e.start_time, e.type, e.format, e.eligibility, e.price,
         e.registration_url, e.info_url, e.description, e.status, e.updated_at
  FROM events e JOIN golfs g ON g.id = e.golf_id`;
