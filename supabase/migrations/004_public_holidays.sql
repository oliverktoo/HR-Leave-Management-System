-- Create public_holidays table for holiday management
-- This table stores company-wide holidays and observances

create table if not exists public_holidays (
    id uuid default gen_random_uuid() primary key,
    name varchar(255) not null,
    date date not null,
    description text,
    holiday_type varchar(50) default 'public' check (holiday_type in ('public', 'national', 'religious', 'company')),
    is_recurring boolean default false,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid references auth.users(id)
);

-- Add indexes for better performance
create index if not exists idx_public_holidays_date on public_holidays(date);
create index if not exists idx_public_holidays_type on public_holidays(holiday_type);
create index if not exists idx_public_holidays_year on public_holidays(extract(year from date));

-- Enable RLS
alter table public_holidays enable row level security;

-- RLS policies for public_holidays
create policy "Public holidays are viewable by authenticated users" 
    on public_holidays for select 
    using (auth.role() = 'authenticated');

create policy "HR admins can manage holidays" 
    on public_holidays for all 
    using (
        auth.jwt() ->> 'role' = 'hr_admin' or
        (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'hr_admin'
    );

-- Trigger to update updated_at timestamp
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('utc'::text, now());
    return new;
end;
$$ language plpgsql;

create trigger update_public_holidays_updated_at
    before update on public_holidays
    for each row
    execute procedure public.update_updated_at_column();

-- Insert some sample holidays for Kenya
insert into public_holidays (name, date, description, holiday_type, is_recurring) values
    ('New Year''s Day', '2024-01-01', 'Start of the calendar year', 'public', true),
    ('Good Friday', '2024-03-29', 'Christian holy day', 'religious', true),
    ('Easter Monday', '2024-04-01', 'Christian holy day', 'religious', true),
    ('Labour Day', '2024-05-01', 'International Workers'' Day', 'public', true),
    ('Madaraka Day', '2024-06-01', 'Kenya''s self-governance day', 'national', true),
    ('Mashujaa Day', '2024-10-20', 'Heroes'' Day', 'national', true),
    ('Jamhuri Day', '2024-12-12', 'Independence Day', 'national', true),
    ('Christmas Day', '2024-12-25', 'Christmas celebration', 'religious', true),
    ('Boxing Day', '2024-12-26', 'Day after Christmas', 'public', true)
on conflict do nothing;