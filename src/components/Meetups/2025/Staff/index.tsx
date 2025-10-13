import StaffCard from "./StaffCard";

type StaffMember = {
  firstname: string;
  lastname: string;
  picture?: { url: string };
  jobTitle?: string;
  linkedin?: string;
};

type StaffProps = {
  staff: StaffMember[];
};

export default function Staff({ staff = [] }: StaffProps) {
  if (staff.length === 0) {
    return null;
  }

  // Sort staff alphabetically by firstname
  const sortedStaff = [...staff].sort((a, b) => a.firstname.localeCompare(b.firstname));

  return (
    <section className="w-full max-w-[1280px] py-16">
      <div className="mb-10 text-center">
        <h2 className="mb-4 text-center text-4xl font-bold text-white md:text-5xl">Equipo de Organización</h2>
        <p className="mx-auto mt-2 max-w-3xl text-balance text-center text-base leading-relaxed text-gray-300 lg:text-lg">
          Personas que hacen posible este evento
        </p>
      </div>

      <div className="flex w-full max-w-7xl flex-row flex-wrap items-center justify-center gap-5">
        {sortedStaff.map((member, index) => (
          <StaffCard
            key={index}
            firstname={member.firstname}
            lastname={member.lastname}
            picture={member.picture}
            jobTitle={member.jobTitle}
            linkedin={member.linkedin}
          />
        ))}
      </div>
    </section>
  );
}
