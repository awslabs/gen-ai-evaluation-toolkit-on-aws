export type GenerationDocument = {
  title: string;
  content: string;
};

export const generationTestData: GenerationDocument[] = [
  {
    title: 'Software Engineering.md',
    content: `
\`\`\`{=mediawiki}
{{short description|Engineering approach to software development}}
\`\`\`

\`\`\`{=mediawiki}
{{Software development process|Core activities}}
\`\`\`

**Software engineering** is a branch of both [computer
science](computer_science 'computer science'){.wikilink} and
[engineering](engineering 'engineering'){.wikilink} focused on
designing, developing, testing, and maintaining [software
applications](Application_software 'software applications'){.wikilink}.
It involves applying [engineering
principles](engineering_design_process 'engineering principles'){.wikilink}
and [computer
programming](computer_programming 'computer programming'){.wikilink}
expertise to develop software systems that meet user
needs.[^1][^2][^3][^4]

The terms _[programmer](programmer 'programmer'){.wikilink}_ and _coder_
overlap _software engineer_, but they imply only the construction aspect
of a typical software engineer workload.[^5]

A software engineer applies a [software development
process](software_development_process 'software development process'){.wikilink},[^6][^7]
which involves defining,
[implementing](Implementation 'implementing'){.wikilink},
[testing](Software_testing 'testing'){.wikilink},
[managing](Project_management 'managing'){.wikilink}, and
[maintaining](Software_maintenance 'maintaining'){.wikilink} software
systems, as well as developing the software development process itself.

## History

\`\`\`{=mediawiki}
{{Main|History of software engineering}}
\`\`\`

Beginning in the 1960s, software engineering was recognized as a
separate field of [engineering](engineering 'engineering'){.wikilink}.

The development of software engineering was seen as a struggle. Problems
included software that was over budget, exceeded deadlines, required
extensive [debugging](debugging 'debugging'){.wikilink} and maintenance,
and unsuccessfully met the needs of consumers or was never even
completed.

In 1968, [NATO](NATO 'NATO'){.wikilink} held the first software
engineering conference where issues related to software were addressed.
Guidelines and best practices for the development of software were
established.[^8]

The origins of the term _software engineering_ have been attributed to
various sources. The term appeared in a list of services offered by
companies in the June 1965 issue of \"Computers and Automation\"[^9] and
was used more formally in the August 1966 issue of _Communications of
the ACM_ (Volume 9, number 8) in \"President\'s Letter to the ACM
Membership\" by Anthony A. Oettinger.[^10][^11][^12] It is also
associated with the title of a NATO conference in 1968 by Professor
[Friedrich L.
Bauer](Friedrich_L._Bauer 'Friedrich L. Bauer'){.wikilink}.[^13]
[Margaret
Hamilton](<Margaret_Hamilton_(software_engineer)> 'Margaret Hamilton'){.wikilink}
described the discipline of \"software engineering\" during the Apollo
missions to give what they were doing legitimacy.[^14] At the time there
was perceived to be a \"[software
crisis](software_crisis 'software crisis'){.wikilink}\".[^15][^16][^17]
The 40th International Conference on Software Engineering (ICSE 2018)
celebrates 50 years of \"Software Engineering\" with the Plenary
Sessions\' keynotes of [Frederick
Brooks](Frederick_Brooks 'Frederick Brooks'){.wikilink}[^18] and
[Margaret
Hamilton](<Margaret_Hamilton_(scientist)> 'Margaret Hamilton'){.wikilink}.[^19]

In 1984, the [Software Engineering
Institute](Software_Engineering_Institute 'Software Engineering Institute'){.wikilink}
(SEI) was established as a federally funded research and development
center headquartered on the campus of [Carnegie Mellon
University](Carnegie_Mellon_University 'Carnegie Mellon University'){.wikilink}
in [Pittsburgh,
Pennsylvania](Pittsburgh 'Pittsburgh, Pennsylvania'){.wikilink}, United
States.[^20] [Watts
Humphrey](Watts_Humphrey 'Watts Humphrey'){.wikilink} founded the SEI
Software Process Program, aimed at understanding and managing the
software engineering process.[^21] The Process Maturity Levels
introduced became the [Capability Maturity Model
Integration](Capability_Maturity_Model_Integration 'Capability Maturity Model Integration'){.wikilink}
for Development (CMMI-DEV), which defined how the US Government
evaluates the abilities of a software development team.

Modern, generally accepted best-practices for software engineering have
been collected by the [ISO/IEC JTC 1/SC
7](ISO/IEC_JTC_1/SC_7 'ISO/IEC JTC 1/SC 7'){.wikilink} subcommittee and
published as the [Software Engineering Body of
Knowledge](Software_Engineering_Body_of_Knowledge 'Software Engineering Body of Knowledge'){.wikilink}
(SWEBOK).[^22] Software engineering is considered one of the major
[computing](computing 'computing'){.wikilink} disciplines.[^23]

## Terminology

### Definition

Notable definitions of software engineering include:

- \"The systematic application of scientific and technological
  knowledge, methods, and experience to the design, implementation,
  testing, and documentation of software.\"---The Bureau of Labor
  Statistics---[IEEE](IEEE 'IEEE'){.wikilink} _Systems and software
  engineering -- Vocabulary_[^24]
- \"The application of a systematic, disciplined, quantifiable approach
  to the development, operation, and maintenance of
  software.\"---[IEEE](IEEE 'IEEE'){.wikilink} _Standard Glossary of
  Software Engineering Terminology_[^25]
- \"An engineering discipline that is concerned with all aspects of
  software production.\"---[Ian
  Sommerville](<Ian_Sommerville_(academic)> 'Ian Sommerville'){.wikilink}[^26]
- \"The establishment and use of sound engineering principles in order
  to economically obtain software that is reliable and works efficiently
  on real machines.\"---[Fritz
  Bauer](Friedrich_L._Bauer 'Fritz Bauer'){.wikilink}[^27]
- \"A branch of computer science that deals with the design,
  implementation, and maintenance of complex [computer
  programs](computer_program 'computer program'){.wikilink}.\"---[Merriam-Webster](Merriam-Webster 'Merriam-Webster'){.wikilink}[^28]
- {{\"\'}}Software engineering\' encompasses not just the act of writing
  code, but all of the tools and processes an organization uses to build
  and maintain that code over time. \[\...\] Software engineering can be
  thought of as \'programming integrated over time.{{\'\"}}---Software
  Engineering at [Google](Google 'Google'){.wikilink}[^29]

The term has also been used less formally:

- as the informal contemporary term for the broad range of activities
  that were formerly called [computer
  programming](computer_programming 'computer programming'){.wikilink}
  and [systems
  analysis](systems_analysis 'systems analysis'){.wikilink}[^30]
- as the broad term for all aspects of the _practice_ of computer
  programming, as opposed to the _theory_ of computer programming, which
  is formally studied as a sub-discipline of [computer
  science](computer_science 'computer science'){.wikilink}[^31]
- as the term embodying the _advocacy_ of a specific approach to
  computer programming, one that urges that it be treated as an
  [engineering](engineering 'engineering'){.wikilink} discipline rather
  than an art or a craft, and advocates the
  [codification](<Codification_(law)> 'codification'){.wikilink} of
  recommended practices[^32]

### Etymology

[Margaret
Hamilton](<Margaret_Hamilton_(scientist)> 'Margaret Hamilton'){.wikilink}
promoted the term \"software engineering\" during her work on the
[Apollo program](Apollo_program 'Apollo program'){.wikilink}. The term
\"engineering\" was used to acknowledge that the work should be taken
just as seriously as other contributions toward the advancement of
technology. Hamilton details her use of the term:

> When I first came up with the term, no one had heard of it before, at
> least in our world. It was an ongoing joke for a long time. They liked
> to kid me about my radical ideas. It was a memorable day when one of
> the most respected hardware gurus explained to everyone in a meeting
> that he agreed with me that the process of building software should
> also be considered an engineering discipline, just like with hardware.
> Not because of his acceptance of the new \"term\" per se, but because
> we had earned his and the acceptance of the others in the room as
> being in an engineering field in its own right.[^33]

### Suitability

Individual commentators have disagreed sharply on how to define
_software engineering_ or its legitimacy as an engineering discipline.
[David Parnas](David_Parnas 'David Parnas'){.wikilink} has said that
software engineering is, in fact, a form of engineering.[^34][^35]
[Steve McConnell](Steve_McConnell 'Steve McConnell'){.wikilink} has said
that it is not, but that it should be.[^36] [Donald
Knuth](Donald_Knuth 'Donald Knuth'){.wikilink} has said that programming
is an art and a science.[^37] [Edsger W.
Dijkstra](Edsger_W._Dijkstra 'Edsger W. Dijkstra'){.wikilink} claimed
that the terms _software engineering_ and _software engineer_ have been
misused in the United States.[^38]

## Workload

\`\`\`{=mediawiki}
{{Main|Outline of software engineering}}
\`\`\`

### Requirements analysis {#requirements_analysis}

\`\`\`{=mediawiki}
{{Main|Software requirements}}
\`\`\`

[Requirements
engineering](Requirements_engineering 'Requirements engineering'){.wikilink}
is about elicitation, analysis, specification, and validation of
[requirements](requirements 'requirements'){.wikilink} for
[software](software 'software'){.wikilink}. Software requirements can be
[functional](functional_requirement 'functional'){.wikilink},
[non-functional](non-functional_requirement 'non-functional'){.wikilink}
or domain.

Functional requirements describe expected behaviors (i.e. outputs).
Non-functional requirements specify issues like portability, security,
maintainability, reliability, scalability, performance, reusability, and
flexibility. They are classified into the following types: interface
constraints, performance constraints (such as response time, security,
storage space, etc.), operating constraints, life cycle constraints
(maintainability, portability, etc.), and economic constraints.
Knowledge of how the system or software works is needed when it comes to
specifying non-functional requirements. Domain requirements have to do
with the characteristic of a certain category or domain of
projects.[^39]

### Design

\`\`\`{=mediawiki}
{{Main|Software design}}
\`\`\`

[Software design](Software_design 'Software design'){.wikilink} is the
process of making high-level plans for the software. Design is sometimes
divided into levels:

- [Interface design](Interface_design 'Interface design'){.wikilink}
  plans the interaction between a system and its environment as well as
  the inner workings of the system.
- [Architectural
  design](Software_architecture 'Architectural design'){.wikilink} plans
  the major components of a system, including their responsibilities,
  properties, and interfaces between them.
- [Detailed
  design](Detailed_design_document 'Detailed design'){.wikilink} plans
  internal elements, including their properties, relationships,
  [algorithms](algorithm 'algorithm'){.wikilink} and [data
  structures](data_structure 'data structure'){.wikilink}.[^40]

### Construction

\`\`\`{=mediawiki}
{{Main|Software construction}}
\`\`\`

Software construction typically involves
[programming](Computer_programming 'programming'){.wikilink} (a.k.a.
coding), [unit testing](unit_testing 'unit testing'){.wikilink},
[integration
testing](integration_testing 'integration testing'){.wikilink}, and
[debugging](debugging 'debugging'){.wikilink} so as to implement the
design.[^41][^42]"Software testing is related to, but different from,
\... debugging".[^43] Testing during this phase is generally performed
by the programmer and with the purpose to verify that the code behaves
as designed and to know when the code is ready for the next level of
testing.\`{{Citation needed|date=May 2023}}\`{=mediawiki}

### Testing

\`\`\`{=mediawiki}
{{Main|Software testing}}
\`\`\`

[Software testing](Software_testing 'Software testing'){.wikilink} is an
empirical, technical investigation conducted to provide stakeholders
with information about the quality of the software under test.[^44][^45]

When described separately from construction, testing typically is
performed by [test
engineers](test_engineers 'test engineers'){.wikilink} or [quality
assurance](quality_assurance 'quality assurance'){.wikilink} instead of
the programmers who wrote it. It is performed at the [system
level](system_testing 'system level'){.wikilink} and is considered an
aspect of [software
quality](software_quality 'software quality'){.wikilink}.

### Program analysis {#program_analysis}

\`\`\`{=mediawiki}
{{Main|Program analysis}}
\`\`\`

Program analysis is the process of analyzing computer programs with
respect to an aspect such as
[performance](Computer_performance 'performance'){.wikilink},
[robustness](<Robustness_(computer_science)> 'robustness'){.wikilink}, and
[security](Security_testing 'security'){.wikilink}.

### Maintenance

\`\`\`{=mediawiki}
{{Main|Software maintenance}}
\`\`\`

[Software
maintenance](Software_maintenance 'Software maintenance'){.wikilink}
refers to supporting the software after release. It may include but is
not limited to: [error
correction](<Patch_(computing)> 'error correction'){.wikilink},
optimization, deletion of [unused](Software_bloat 'unused'){.wikilink}
and discarded features, and enhancement of existing features.[^46][^47]

Usually, maintenance takes up 40% to 80% of project cost.[^48]

## Education

\`\`\`{=mediawiki}
{{Globalize|date=November 2010}}
\`\`\`

Knowledge of [computer
programming](computer_programming 'computer programming'){.wikilink} is
a prerequisite for becoming a software engineer. In 2004, the [IEEE
Computer
Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink}
produced the [SWEBOK](SWEBOK 'SWEBOK'){.wikilink}, which has been
published as ISO/IEC Technical Report 1979:2005, describing the body of
knowledge that they recommend to be mastered by a graduate software
engineer with four years of experience.[^49] Many software engineers
enter the profession by obtaining a university degree or training at a
vocational school. One standard international curriculum for
undergraduate software engineering degrees was defined by the Joint Task
Force on Computing Curricula of the [IEEE Computer
Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink} and
the [Association for Computing
Machinery](Association_for_Computing_Machinery 'Association for Computing Machinery'){.wikilink},
and updated in 2014.[^50] A number of universities have Software
Engineering degree programs; \`{{As of|2010|lc=on}}\`{=mediawiki}, there
were 244 Campus [Bachelor of Software
Engineering](Bachelor_of_Software_Engineering 'Bachelor of Software Engineering'){.wikilink}
programs, 70 Online programs, 230 Masters-level programs, 41
Doctorate-level programs, and 69 Certificate-level programs in the
United States.

In addition to university education, many companies sponsor internships
for students wishing to pursue careers in information technology. These
internships can introduce the student to real-world tasks that typical
software engineers encounter every day. Similar experience can be gained
through [military
service](military_service 'military service'){.wikilink} in software
engineering.

### Software engineering degree programs {#software_engineering_degree_programs}

Half of all practitioners today have
[degrees](academic_degree 'degree'){.wikilink} in [computer
science](computer_science 'computer science'){.wikilink}, [information
systems](information_systems 'information systems'){.wikilink}, or
[information
technology](information_technology 'information technology'){.wikilink}.\`{{Citation needed|date=February 2007}}\`{=mediawiki}
A small but growing number of practitioners have software engineering
degrees. In 1987, the [Department of
Computing](Department_of_Computing,_Imperial_College_London 'Department of Computing'){.wikilink}
at [Imperial College
London](Imperial_College_London 'Imperial College London'){.wikilink}
introduced the first three-year software engineering [bachelor\'s
degree](bachelor's_degree "bachelor's degree"){.wikilink} in the world;
in the following year, the [University of
Sheffield](University_of_Sheffield 'University of Sheffield'){.wikilink}
established a similar program.[^51] In 1996, the [Rochester Institute of
Technology](Rochester_Institute_of_Technology 'Rochester Institute of Technology'){.wikilink}
established the first software engineering bachelor\'s degree program in
the United States; however, it did not obtain
[ABET](ABET 'ABET'){.wikilink} accreditation until 2003, the same year
as [Rice University](Rice_University 'Rice University'){.wikilink},
[Clarkson
University](Clarkson_University 'Clarkson University'){.wikilink},
[Milwaukee School of
Engineering](Milwaukee_School_of_Engineering 'Milwaukee School of Engineering'){.wikilink},
and [Mississippi State
University](Mississippi_State_University 'Mississippi State University'){.wikilink}.[^52]
In 1997, PSG College of Technology in Coimbatore, India was the first to
start a five-year integrated Master of Science degree in Software
Engineering.\`{{citation needed|date=May 2012}}\`{=mediawiki}

Since then, software engineering undergraduate degrees have been
established at many universities. A standard international curriculum
for undergraduate software engineering degrees,
[SE2004](SE2004 'SE2004'){.wikilink}, was defined by a steering
committee between 2001 and 2004 with funding from the [Association for
Computing
Machinery](Association_for_Computing_Machinery 'Association for Computing Machinery'){.wikilink}
and the [IEEE Computer
Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink}.
\`{{As of|2004}}\`{=mediawiki}, about 50 universities in the U.S. offer
software engineering degrees, which teach both computer science and
engineering principles and practices. The first software engineering
[master\'s degree](master's_degree "master's degree"){.wikilink} was
established at [Seattle
University](Seattle_University 'Seattle University'){.wikilink} in 1979.
Since then, graduate software engineering degrees have been made
available from many more universities. Likewise in Canada, the Canadian
Engineering Accreditation Board (CEAB) of the [Canadian Council of
Professional
Engineers](Canadian_Council_of_Professional_Engineers 'Canadian Council of Professional Engineers'){.wikilink}
has recognized several software engineering programs.

In 1998, the US [Naval Postgraduate
School](Naval_Postgraduate_School 'Naval Postgraduate School'){.wikilink}
(NPS) established the first
[doctorate](doctorate 'doctorate'){.wikilink} program in Software
Engineering in the
world.\`{{Citation needed|date=June 2007}}\`{=mediawiki} Additionally,
many online advanced degrees in Software Engineering have appeared such
as the Master of Science in Software Engineering (MSE) degree offered
through the Computer Science and Engineering Department at [California
State University,
Fullerton](California_State_University,_Fullerton 'California State University, Fullerton'){.wikilink}.
[Steve McConnell](Steve_McConnell 'Steve McConnell'){.wikilink} opines
that because most universities teach computer science rather than
software engineering, there is a shortage of true software
engineers.[^53] [ETS](École_de_technologie_supérieure 'ETS'){.wikilink}
(École de technologie supérieure) University and
[UQAM](UQAM 'UQAM'){.wikilink} (Université du Québec à Montréal) were
mandated by IEEE to develop the Software Engineering Body of Knowledge
([SWEBOK](SWEBOK 'SWEBOK'){.wikilink}), which has become an ISO standard
describing the body of knowledge covered by a software engineer.[^54]

## Profession

\`\`\`{=mediawiki}
{{main|Software engineering professionalism|Regulation and licensure in engineering}}
\`\`\`

[Legal](Legal 'Legal'){.wikilink} requirements for the licensing or
certification of professional software engineers vary around the world.
In the UK, there is no licensing or legal requirement to assume or use
the job title Software Engineer. In some areas of Canada, such as
Alberta, British Columbia, Ontario,[^55] and Quebec, software engineers
can hold the Professional Engineer (P.Eng) designation and/or the
Information Systems Professional (I.S.P.) designation. In Europe,
Software Engineers can obtain the [European
Engineer](European_Engineer 'European Engineer'){.wikilink} (EUR ING)
professional title. Software Engineers can also become professionally
qualified as a [Chartered
Engineer](<Chartered_Engineer_(UK)> 'Chartered Engineer'){.wikilink}
through the [British Computer
Society](British_Computer_Society 'British Computer Society'){.wikilink}.

In the United States, the [NCEES](NCEES 'NCEES'){.wikilink} began
offering a [Professional
Engineer](Professional_Engineer 'Professional Engineer'){.wikilink} exam
for Software Engineering in 2013, thereby allowing Software Engineers to
be licensed and recognized.[^56] NCEES ended the exam after April 2019
due to lack of participation.[^57] Mandatory licensing is currently
still largely debated, and perceived as controversial.[^58][^59]

The [IEEE Computer
Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink} and
the [ACM](Association_for_Computing_Machinery 'ACM'){.wikilink}, the two
main US-based professional organizations of software engineering,
publish guides to the profession of software engineering. The IEEE\'s
_Guide to the Software Engineering Body of Knowledge -- 2004 Version_,
or [SWEBOK](SWEBOK 'SWEBOK'){.wikilink}, defines the field and describes
the knowledge the IEEE expects a practicing software engineer to have.
The most current version is SWEBOK v4.[^60] The IEEE also promulgates a
\"Software Engineering Code of Ethics\".[^61]

### Employment

\`\`\`{=mediawiki}
{{globalize|United States|date=September 2021}}
\`\`\`

\`\`\`{=mediawiki}
{{See also|Software engineering demographics}}
\`\`\`

There are an estimated 26.9 million professional software engineers in
the world as of 2022, up from 21 million in 2016.[^62][^63]

Many software engineers work as employees or contractors. Software
engineers work with businesses, government agencies (civilian or
military), and non-profit organizations. Some software engineers work
for themselves as [freelancers](freelancer 'freelancer'){.wikilink}.
Some organizations have specialists to perform each of the tasks in the
[software development
process](software_development_process 'software development process'){.wikilink}.
Other organizations require software engineers to do many or all of
them. In large projects, people may specialize in only one role. In
small projects, people may fill several or all roles at the same time.
Many companies hire [interns](Internship 'interns'){.wikilink}, often
university or college students during a summer break, or
[externships](externship 'externship'){.wikilink}. Specializations
include [analysts](Requirements_analysis 'analysts'){.wikilink},
[architects](Software_architecture 'architects'){.wikilink},
[developers](Software_developer 'developers'){.wikilink},
[testers](Software_testing 'testers'){.wikilink}, [technical
support](technical_support 'technical support'){.wikilink}, [middleware
analysts](middleware_analyst 'middleware analyst'){.wikilink}, [project
managers](Project_management 'project managers'){.wikilink}, [software
product
managers](Software_product_management 'software product managers'){.wikilink},
[educators](educator 'educator'){.wikilink}, and
[researchers](researcher 'researcher'){.wikilink}.

Most software engineers and programmers work 40 hours a week, but about
15 percent of software engineers and 11 percent of programmers worked
more than 50 hours a week in 2008.[^64] Potential injuries in these
occupations are possible because like other workers who spend long
periods [sitting](Sitting#Health_risks 'sitting'){.wikilink} in front of
a computer terminal typing at a keyboard, engineers and programmers are
susceptible to eyestrain, back discomfort,
[Thrombosis](Thrombosis_prevention 'Thrombosis'){.wikilink},
[Obesity](Obesity 'Obesity'){.wikilink}, and hand and wrist problems
such as [carpal tunnel
syndrome](carpal_tunnel_syndrome 'carpal tunnel syndrome'){.wikilink}.[^65]

#### United States {#united_states}

The [U. S. Bureau of Labor
Statistics](Bureau_of_Labor_Statistics 'U. S. Bureau of Labor Statistics'){.wikilink}
(BLS) counted 1,365,500 software developers holding jobs in the
[U.S.](United_States 'U.S.'){.wikilink} in 2018.[^66] Due to its
relative newness as a field of study, formal education in software
engineering is often taught as part of a computer science curriculum,
and many software engineers hold computer science degrees.[^67] The BLS
estimates from 2023 to 2033 that computer software engineering would
increase by 17%.[^68] This is down from the 2022 to 2032 BLS estimate of
25% for software engineering.[^69][^70] And, is further down from their
30% 2010 to 2020 BLS estimate.[^71] Due to this trend, job growth may
not be as fast as during the last decade, as jobs that would have gone
to computer software engineers in the United States would instead be
outsourced to computer software engineers in countries such as India and
other foreign countries.[^72][^73] In addition, the BLS Job Outlook for
Computer Programmers, the [U.S. Bureau of Labor
Statistics](U.S._Bureau_of_Labor_Statistics 'U.S. Bureau of Labor Statistics'){.wikilink}
(BLS) Occupational Outlook predicts a decline of -7 percent from 2016 to
2026, a further decline of -9 percent from 2019 to 2029, a decline of
-10 percent from 2021 to 2031.[^74] and then a decline of -11 percent
from 2022 to 2032.[^75] Since computer programming can be done from
anywhere in the world, companies sometimes hire programmers in countries
where wages are lower.[^76][^77][^78] Furthermore, the ratio of women in
many software fields has also been declining over the years as compared
to other engineering fields.[^79] Then there is the additional concern
that recent advances in [Artificial
Intelligence](Artificial_Intelligence 'Artificial Intelligence'){.wikilink}
might impact the demand for future generations of Software
Engineers.[^80][^81][^82][^83][^84][^85][^86] However, this trend may
change or slow in the future as many current software engineers in the
U.S. market flee the profession or [age
out](Age_wave 'age out'){.wikilink} of the market in the next few
decades.[^87]

### Certification

The [Software Engineering
Institute](Software_Engineering_Institute 'Software Engineering Institute'){.wikilink}
offers certifications on specific topics like
[security](IT_security 'security'){.wikilink}, process improvement and
[software
architecture](software_architecture 'software architecture'){.wikilink}.[^88]
[IBM](Information_Technology_Architect_Certification 'IBM'){.wikilink},
[Microsoft](Microsoft_Certified_Professional 'Microsoft'){.wikilink} and
other companies also sponsor their own certification examinations. Many
[IT](Information_technology 'IT'){.wikilink}
[certification](<Professional_certification_(computer_technology)> 'certification'){.wikilink}
programs are oriented toward specific technologies, and managed by the
vendors of these technologies.[^89] These certification programs are
tailored to the institutions that would employ people who use these
technologies.

Broader certification of general software engineering skills is
available through various professional societies.
\`{{As of|2006}}\`{=mediawiki}, the [IEEE](IEEE 'IEEE'){.wikilink} had
certified over 575 software professionals as a [Certified Software
Development
Professional](Certified_Software_Development_Professional 'Certified Software Development Professional'){.wikilink}
(CSDP).[^90] In 2008 they added an entry-level certification known as
the Certified Software Development Associate (CSDA).[^91] The
[ACM](Association_for_Computing_Machinery 'ACM'){.wikilink} had a
professional certification program in the early
1980s,\`{{Citation needed|date=March 2009}}\`{=mediawiki} which was
discontinued due to lack of interest. The ACM and the [IEEE Computer
Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink}
together examined the possibility of licensing of software engineers as
Professional Engineers in the 1990s, but eventually decided that such
licensing was inappropriate for the professional industrial practice of
software engineering.[^92] John C. Knight and [Nancy G.
Leveson](Nancy_G._Leveson 'Nancy G. Leveson'){.wikilink} presented a
more balanced analysis of the licensing issue in 2002.[^93]

In the U.K. the [British Computer
Society](British_Computer_Society 'British Computer Society'){.wikilink}
has developed a legally recognized professional certification called
_Chartered IT Professional (CITP)_, available to fully qualified members
(_MBCS_). Software engineers may be eligible for membership of the
[British Computer
Society](British_Computer_Society 'British Computer Society'){.wikilink}
or [Institution of Engineering and
Technology](Institution_of_Engineering_and_Technology 'Institution of Engineering and Technology'){.wikilink}
and so qualify to be considered for [Chartered
Engineer](<Chartered_Engineer_(UK)> 'Chartered Engineer'){.wikilink}
status through either of those institutions. In Canada the [Canadian
Information Processing
Society](Canadian_Information_Processing_Society 'Canadian Information Processing Society'){.wikilink}
has developed a legally recognized professional certification called
_Information Systems Professional (ISP)_.[^94] In Ontario, Canada,
Software Engineers who graduate from a _Canadian Engineering
Accreditation Board (CEAB)_ accredited program, successfully complete
PEO\'s (_Professional Engineers Ontario_) Professional Practice
Examination (PPE) and have at least 48 months of acceptable engineering
experience are eligible to be licensed through the _Professional
Engineers Ontario_ and can become Professional Engineers P.Eng.[^95] The
PEO does not recognize any online or distance education however; and
does not consider Computer Science programs to be equivalent to software
engineering programs despite the tremendous overlap between the two.
This has sparked controversy and a certification war. It has also held
the number of P.Eng holders for the profession exceptionally low. The
vast majority of working professionals in the field hold a degree in CS,
not SE. Given the difficult certification path for holders of non-SE
degrees, most never bother to pursue the license.

### Impact of globalization {#impact_of_globalization}

The initial impact of outsourcing, and the relatively lower cost of
international human resources in developing third world countries led to
a massive migration of software development activities from corporations
in North America and Europe to India and later: China, Russia, and other
developing countries. This approach had some flaws, mainly the distance
/ time zone difference that prevented human interaction between clients
and developers and the massive job transfer. This had a negative impact
on many aspects of the software engineering profession. For example,
some students in the [developed
world](developed_world 'developed world'){.wikilink} avoid education
related to software engineering because of the fear of [offshore
outsourcing](offshore_outsourcing 'offshore outsourcing'){.wikilink}
(importing software products or services from other countries) and of
being displaced by [foreign visa
workers](Foreign_Worker_Visa 'foreign visa workers'){.wikilink}.[^96]
Although statistics do not currently show a threat to software
engineering itself; a related career, [computer
programming](computer_programming 'computer programming'){.wikilink}
does appear to have been affected.[^97] Nevertheless, the ability to
smartly leverage offshore and near-shore resources via the
[follow-the-sun](follow-the-sun 'follow-the-sun'){.wikilink} workflow
has improved the overall operational capability of many
organizations.[^98] When North Americans leave work, Asians are just
arriving to work. When Asians are leaving work, Europeans arrive to
work. This provides a continuous ability to have human oversight on
business-critical processes 24 hours per day, without paying overtime
compensation or disrupting a key human resource, sleep patterns.

While global outsourcing has several advantages, global -- and generally
distributed -- development can run into serious difficulties resulting
from the distance between developers. This is due to the key elements of
this type of distance that have been identified as geographical,
temporal, cultural and communication (that includes the use of different
languages and dialects of English in different locations).[^99] Research
has been carried out in the area of global software development over the
last 15 years and an extensive body of relevant work published that
highlights the benefits and problems associated with the complex
activity. As with other aspects of software engineering research is
ongoing in this and related areas.

### Prizes

There are various prizes in the field of software engineering:

- [ACM-AAAI Allen Newell
  Award](ACM-AAAI_Allen_Newell_Award 'ACM-AAAI Allen Newell Award'){.wikilink}-
  USA. Awarded to career contributions that have breadth within computer
  science, or that bridge computer science and other disciplines.
- [BCS Lovelace
  Medal](BCS_Lovelace_Medal 'BCS Lovelace Medal'){.wikilink}. Awarded to
  individuals who have made outstanding contributions to the
  understanding or advancement of computing.
- [ACM SIGSOFT](ACM_SIGSOFT 'ACM SIGSOFT'){.wikilink} Outstanding
  Research Award, selected for individual(s) who have made
  "[significant](Importance 'significant'){.wikilink} and
  [lasting](Sustainability 'lasting'){.wikilink}
  [research](research 'research'){.wikilink} contributions to the
  [theory](theory 'theory'){.wikilink} or
  [practice](Empirical_research 'practice'){.wikilink} of software
  engineering."[^100]

<!-- -->

- More [ACM SIGSOFT](ACM_SIGSOFT 'ACM SIGSOFT'){.wikilink} Awards.[^101]

<!-- -->

- The [Codie
  award](Software_and_Information_Industry_Association#CODiE_Awards 'Codie award'){.wikilink},
  a yearly award issued by the Software and Information Industry
  Association for excellence in software development within the software
  industry.

<!-- -->

- [Harlan Mills
  Award](Harlan_Mills#Harlan_D._Mills_Award 'Harlan Mills Award'){.wikilink}
  for \"contributions to the theory and practice of the information
  sciences, focused on software engineering\".

<!-- -->

- ICSE Most Influential Paper Award.[^102]

<!-- -->

- [Jolt Award](Jolt_Award 'Jolt Award'){.wikilink}, also for the
  software industry.

<!-- -->

- [Stevens Award](Stevens_Award 'Stevens Award'){.wikilink} given in
  memory of Wayne Stevens.

## Criticism

Some call for licensing, certification and codified bodies of knowledge
as mechanisms for spreading the engineering knowledge and maturing the
field.[^103]

Some claim that the concept of software engineering is so new that it is
rarely understood, and it is widely misinterpreted, including in
software engineering textbooks, papers, and among the communities of
programmers and crafters.[^104]

Some claim that a core issue with software engineering is that its
approaches are not empirical enough because a real-world validation of
approaches is usually absent, or very limited and hence software
engineering is often misinterpreted as feasible only in a \"theoretical
environment.\"[^105]

[Edsger Dijkstra](Edsger_Dijkstra 'Edsger Dijkstra'){.wikilink}, a
founder of many of the concepts in software development today, rejected
the idea of \"software engineering\" up until his death in 2002, arguing
that those terms were poor analogies for what he called the \"radical
novelty\" of [computer
science](computer_science 'computer science'){.wikilink}:

\`\`\`{=mediawiki}
{{quotation |
A number of these phenomena have been bundled under the name "Software Engineering". As economics is known as "The Miserable Science", software engineering should be known as "The Doomed Discipline", doomed because it cannot even approach its goal since its goal is self-contradictory. Software engineering, of course, presents itself as another worthy cause, but that is eyewash: if you carefully read its literature and analyse what its devotees actually do, you will discover that software engineering has accepted as its charter "How to program if you cannot."<ref>{{cite web | url=http://www.cs.utexas.edu/~EWD/transcriptions/EWD10xx/EWD1036.html| title=On the cruelty of really teaching computing science| last = Dijkstra| first = E. W.| author-link = Edsger Dijkstra| year=1988	| access-date=2014-01-10}}</ref>}}
\`\`\`

## See also {#see_also}

\`\`\`{=mediawiki}
{{Commons category|Software engineers}}
\`\`\`

### Study and practice {#study_and_practice}

- [Computer science](Computer_science 'Computer science'){.wikilink}
- [Data engineering](Data_engineering 'Data engineering'){.wikilink}
- [Software
  craftsmanship](Software_craftsmanship 'Software craftsmanship'){.wikilink}
- [Software
  development](Software_development 'Software development'){.wikilink}
- [Release
  engineering](Release_engineering 'Release engineering'){.wikilink}

### Roles

- [Programmer](Programmer 'Programmer'){.wikilink}
- [Systems analyst](Systems_analyst 'Systems analyst'){.wikilink}
- [Systems architect](Systems_architect 'Systems architect'){.wikilink}

### Professional aspects {#professional_aspects}

- [Bachelor of Science in Information
  Technology](Bachelor_of_Science_in_Information_Technology 'Bachelor of Science in Information Technology'){.wikilink}
- [Bachelor of Software
  Engineering](Bachelor_of_Software_Engineering 'Bachelor of Software Engineering'){.wikilink}
- [List of software engineering
  conferences](List_of_software_engineering_conferences 'List of software engineering conferences'){.wikilink}
- [List of computer science
  journals](List_of_computer_science_journals 'List of computer science journals'){.wikilink}
  (including software engineering journals)
- [Software Engineering
  Institute](Software_Engineering_Institute 'Software Engineering Institute'){.wikilink}

## References

### Citations

\`\`\`{=mediawiki}
{{reflist}}
\`\`\`

### Sources

\`\`\`{=mediawiki}
{{refbegin}}
\`\`\`

- \`\`\`{=mediawiki}
  {{cite book |title= Guide to the Software Engineering Body of Knowledge Version 3.0 (SWEBOK) |editor1=Pierre Bourque |editor2=Richard E. (Dick) Fairley |date=2014 |url=https://www.computer.org/web/swebok/v3 |publisher=[[IEEE Computer Society]]}}
  \`\`\`

<!-- -->

- \`\`\`{=mediawiki}
  {{cite book |editor1=Alain Abran |editor2=James W. Moore |editor3=Pierre Bourque |editor4=Robert Dupuis |editor5=Leonard L. Tripp |title=Guide to the Software Engineering Body of Knowledge |publisher=[[IEEE Computer Society]] |date=2004 |url=http://www.computer.org/portal/web/swebok |access-date = 2010-09-13 |archive-date=2016-05-09 |archive-url=https://web.archive.org/web/20160509154355/https://www.computer.org/portal/web/swebok |url-status= dead}}
  \`\`\`

<!-- -->

- \`\`\`{=mediawiki}
  {{cite book
  |title= Software Engineering
  |author=Ian Sommerville
  |publisher=Pearson Education Limited
  |date= March 24, 2015
  |edition=10th
  |isbn=978-0-13-394303-0}}
  \`\`\`

\`\`\`{=mediawiki}
{{refend}}
\`\`\`

## Further reading {#further_reading}

- \`\`\`{=mediawiki}
  {{cite book |title= Guide to the Software Engineering Body of Knowledge Version 3.0 (SWEBOK) |editor1=Pierre Bourque |editor2=Richard E. (Dick) Fairley |date=2014 |url=https://www.computer.org/web/swebok/v3 |publisher=[[IEEE Computer Society]]}}
  \`\`\`

<!-- -->

- \`\`\`{=mediawiki}
  {{cite book
  |title=Software Engineering: A Practitioner's Approach
  |author1=Roger S. Pressman
  |author2=Bruce Maxim
  |edition=8th
  |date=January 23, 2014
  |isbn=978-0-07-802212-8
  |publisher=McGraw-Hill
  }}
  \`\`\`

<!-- -->

- \`\`\`{=mediawiki}
  {{cite book
  |title= Software Engineering
  |author=Ian Sommerville
  |publisher=Pearson Education Limited
  |date= March 24, 2015
  |edition=10th
  |isbn=978-0-13-394303-0}}
  \`\`\`

<!-- -->

- \`\`\`{=mediawiki}
  {{Cite book|last= Jalote|first=Pankaj|author-link=Pankaj Jalote
   | title = An Integrated Approach to Software Engineering |orig-year = 1991
   | url = https://www.springer.com/gp/book/9780387208817
   | edition = 3rd | year = 2005
   | publisher = Springer
   | isbn = 978-0-387-20881-7 }}
  \`\`\`

- \`\`\`{=mediawiki}
  {{Cite book|last1=Bruegge|first1=Bernd|author-link1=Bernd Bruegge|last2=Dutoit|first2=Allen|edition=3rd|year=2009|title=Object-oriented software engineering : using UML, patterns, and Java|publisher=Prentice Hall|isbn=978-0-13-606125-0|url-access=registration|url=https://archive.org/details/objectorientedso0000brue}}
  \`\`\`

- \`\`\`{=mediawiki}
  {{cite book |last1=Oshana |first1=Robert |title=Software engineering for embedded systems : methods, practical techniques, and applications |publisher=Kidlington, Oxford, United Kingdom |isbn=978-0-12-809433-4 |edition=Second|date=2019-06-21 }}
  \`\`\`

## External links {#external_links}

\`\`\`{=mediawiki}
{{Commons category}}
\`\`\`

\`\`\`{=mediawiki}
{{wikiversity}}
\`\`\`

- Pierre Bourque; Richard E. Fairley, eds. (2004). _Guide to the
  Software Engineering Body of Knowledge Version 3.0 (SWEBOK)_,
  <https://www.computer.org/web/swebok/v3>. [IEEE Computer
  Society](IEEE_Computer_Society 'IEEE Computer Society'){.wikilink}.
- [The Open Systems Engineering and Software Development Life Cycle
  Framework](http://opensdlc.org/)
  \`{{Webarchive|url=https://web.archive.org/web/20100718114646/http://opensdlc.org/ |date=2010-07-18}}\`{=mediawiki}
  OpenSDLC.org the integrated Creative Commons SDLC
- [Software Engineering Institute](http://www.sei.cmu.edu/) Carnegie
  Mellon

\`\`\`{=mediawiki}
{{Software engineering|state=expanded}}
\`\`\`

\`\`\`{=mediawiki}
{{Systems engineering}}
\`\`\`

\`\`\`{=mediawiki}
{{Engineering fields}}
\`\`\`

\`\`\`{=mediawiki}
{{Computer science}}
\`\`\`

\`\`\`{=mediawiki}
{{Authority control}}
\`\`\`

[ ](Category:Software_engineering ' '){.wikilink} [Category:Engineering
disciplines](Category:Engineering_disciplines 'Category:Engineering disciplines'){.wikilink}

[^1]:
    \`\`\`{=mediawiki}
    {{harvnb |Abran |Moore |Bourque| Dupuis |2004}}
    \`\`\`

[^2]:
    \`\`\`{=mediawiki}
    {{cite web |last=ACM |year=2007 |title=Computing Degrees & Careers |url=http://computingcareers.acm.org/?page_id=12 |url-status=dead |access-date=2010-11-23 |publisher=ACM |archive-date=2011-06-17 |archive-url=https://web.archive.org/web/20110617053818/http://computingcareers.acm.org/?page_id=12 }}
    \`\`\`

[^3]:
    \`\`\`{=mediawiki}
    {{cite book |last1=Laplante |first1=Phillip |year=2007 |title=What Every Engineer Should Know about Software Engineering |publisher=CRC |location=Boca Raton |isbn=978-0-8493-7228-5 |url=https://books.google.com/books?id=pFHYk0KWAEgC&q=What%20Every%20Engineer%20Should%20Know%20about%20Software%20Engineering.&pg=PA1 |access-date=2011-01-21}}
    \`\`\`

[^4]:
    \`\`\`{=mediawiki}
    {{cite web|url=https://www.coursera.org/articles/software-engineer|title=What Does a Software Engineer Do?|publisher=[[coursera]]|date=Oct 31, 2022}}
    \`\`\`

[^5]:
    \`\`\`{=mediawiki}
    {{cite magazine |last1=Bogost |first1=Ian |date=5 November 2015 |url=https://www.theatlantic.com/technology/archive/2015/11/programmers-should-not-call-themselves-engineers/414271/ |title=Programmers: Stop Calling Yourselves Engineers |website=[[The Atlantic]]}}
    \`\`\`

[^6]:

[^7]:
    \`\`\`{=mediawiki}
    {{cite book |editor1-last=Bourque |editor1-first=Pierre |editor2-last=Fairley |editor2-first=Richard E. (Dick) |date=2014 |title=Guide to the Software Engineering Body of Knowledge Version 3.0 (SWEBOK) |url=https://www.computer.org/web/swebok/v3 |publisher=[[IEEE Computer Society]]}}
    \`\`\`

[^8]:
    \`\`\`{=mediawiki}
    {{Cite web|title=The history of coding and software engineering|url=https://www.hackreactor.com/blog/the-history-of-coding-and-software-engineering|access-date=2021-05-06|website=www.hackreactor.com|language=en-US|archive-date=2022-03-24|archive-url=https://web.archive.org/web/20220324032759/https://www.hackreactor.com/blog/the-history-of-coding-and-software-engineering/|url-status=dead}}
    \`\`\`

[^9]:
    \`\`\`{=mediawiki}
    {{cite web |title=Computers and Automation: The Computer Directory and Buyers' Guide, 1965 |url=http://www.bitsavers.org/magazines/Computers_And_Automation/196506.pdf |website=bitsavers.org |access-date=15 July 2023}}
    \`\`\`

[^10]:
    \`\`\`{=mediawiki}
    {{cite web |url=https://bertrandmeyer.com/wp-content/upLoads/ACM-1966-Presidental-letter.pdf |quote=We must recognize ourselves -- not necessarily all of us, and not necessarily any one of us all the time -- as members of an engineering profession, be it hardware engineering or software engineering, a profession without artificial and irrelevant boundaries like that between "scientific" and "business" applications. |title=President's Letter to the ACM Membership |access-date=27 February 2025}}
    \`\`\`

[^11]:
    \`\`\`{=mediawiki}
    {{cite journal |last1=Oettinger |first1=A. G. |year=1966 |title=President's Letter to the ACM Membership |publisher=Association for Computing Machinery |volume=9 |number=8 |issn=0001-0782 |doi=10.1145/365758.3291288 |journal=Commun. ACM |pages=545–546 |s2cid=53432801 |doi-access = free}}
    \`\`\`

[^12]:
    \`\`\`{=mediawiki}
    {{cite web
    | url = https://bertrandmeyer.com/2013/04/04/the-origin-of-software-engineering/
    | title = The origin of "software engineering"
    | date = 4 April 2013
    | access-date = 17 November 2017}}
    \`\`\`

[^13]:
    \`\`\`{=mediawiki}
    {{cite web
    | url = http://homepages.cs.ncl.ac.uk/brian.randell/NATO/NATOReports/
    | title = The 1968/69 NATO Software Engineering Reports
    | last = Randall | first = Brian
    | access-date = 17 November 2017}}
    \`\`\`

[^14]:
    \`\`\`{=mediawiki}
    {{cite web |title=Margaret Hamilton: First Software Engineer |author=Lori Cameron |website=Tech News |url=https://www.computer.org/publications/tech-news/events/what-to-know-about-the-scientist-who-invented-the-term-software-engineering |date=October 5, 2008 |publisher=[[IEEE Computer Society]]}}
    \`\`\`

[^15]:
    \`\`\`{=mediawiki}
    {{cite book
    |title= Software Engineering
    |author=Ian Sommerville
    |publisher=Pearson Education Limited
    |date= March 24, 2015
    |edition=10th
    |isbn=978-0-13-394303-0}}
    \`\`\`

[^16]:
    \`\`\`{=mediawiki}
    {{cite conference|author-first1=Naur|author-last1=Peter|author-first2=Brian |author-last2=Randell|author-link2=Brian Randell| title = Software Engineering: Report of a conference sponsored by the NATO Science Committee| publisher = Scientific Affairs Division, NATO| date = 7–11 October 1968| location = Garmisch, Germany| url = http://homepages.cs.ncl.ac.uk/brian.randell/NATO/nato1968.PDF| access-date = 2008-12-26}}
    \`\`\`

[^17]:
    \`\`\`{=mediawiki}
    {{cite web | url = http://homepages.cs.ncl.ac.uk/brian.randell/NATO/NATOReports/index.html| title = The 1968/69 NATO Software Engineering Reports| access-date = 2008-10-11 | last = Randell | first = Brian | author-link = Brian Randell|date = 10 August 2001| work = Brian Randell's University Homepage| publisher = The School of the Computer Sciences, Newcastle University| quote = The idea for the first NATO Software Engineering Conference, and in particular that of adopting the then practically unknown term "software engineering" as its (deliberately provocative) title, I believe came originally from Professor [[Friedrich L. Bauer|Fritz Bauer]].}}
    \`\`\`

[^18]:
    \`\`\`{=mediawiki}
    {{cite web
    | url = https://www.youtube.com/watch?v=StN49re9Nq8&t=67s | title = ICSE 2018 – Plenary Sessions – Fred Brooks | author = 2018 International Conference on Software Engineering celebrating its 40th anniversary, and 50 years of Software engineering | website = [[YouTube]] | date = 31 May 2018 | access-date = 9 August 2018}}
    \`\`\`

[^19]:
    \`\`\`{=mediawiki}
    {{cite web
    | url = https://www.youtube.com/watch?v=ZbVOF0Uk5lU | title = ICSE 2018 – Plenary Sessions – Margaret Hamilton | author = 2018 International Conference on Software Engineering celebrating its 40th anniversary, and 50 years of Software engineering | website = [[YouTube]] | date = 31 May 2018 | access-date = 9 August 2018}}
    \`\`\`

[^20]:
    \`\`\`{=mediawiki}
    {{cite journal
    |title=Software engineering institute (SEI)
    |author=Linda Hutz Pesante
    |journal=Encyclopedia of Computer Science
    |publisher=[[Wiley (publisher)|John Wiley and Sons Ltd.]]
    |location=[[Chichester]], West Sussex, UK
    |editor1=Anthony Ralston
    |editor2=Edwin D. Reilly
    |isbn=978-0-470-86412-8
    |date=January 1, 2003
    |pages=1611–1613
    |url=https://dl.acm.org/doi/10.5555/1074100.1074803
    |quote="(1) The institute was competitively awarded to [[Carnegie Mellon]] in December 1984 by the [[US Department of Defense]] (DoD) to improve the state of the practice of software engineering. ... (2) the SEI moves mature solutions of proven value into widespread use; examples include the [[Capability Maturity Model]] (CMM) ..."}}
    \`\`\`

    \`{{free access}}\`{=mediawiki}

[^21]:

[^22]:

[^23]:
    \`\`\`{=mediawiki}
    {{cite book |title=Software Engineering 2014: Curriculum Guidelines for Undergraduate Degree Programs in Software Engineering |series=A Volume of the Computing Curricula Series |date=23 February 2015 |author=Joint Task Force on Computing Curricula, [[IEEE Computer Society]], [[Association for Computing Machinery]] |publisher=[[IEEE Computer Society]] and [[Association for Computing Machinery]] |url=https://www.acm.org/binaries/content/assets/education/se2014.pdf}}
    \`\`\`

[^24]:
    _Systems and software engineering -- Vocabulary_,
    [ISO](ISO 'ISO'){.wikilink}/[IEC](International_Electrotechnical_Commission 'IEC'){.wikilink}/[IEEE](IEEE 'IEEE'){.wikilink}
    std 24765:2010(E), 2010.

[^25]:
    _IEEE Standard Glossary of Software Engineering Terminology_,
    [IEEE](IEEE 'IEEE'){.wikilink} std 610.12-1990, 1990.

[^26]:
    \`\`\`{=mediawiki}
    {{cite book
    | last=Sommerville |first=Ian |author-link=Ian Sommerville (academic)
    | title=Software Engineering |orig-year=1982
    | chapter-url=http://www.pearsoned.co.uk/HigherEducation/Booksby/Sommerville/
    | edition=8th |year=2007
    | publisher=Pearson Education |location=Harlow, England
    | isbn=978-0-321-31379-9 |pages=7 |chapter=1.1.2 What is software engineering?
    | quote=Software engineering is an engineering discipline that is concerned with all aspects of software production from the early stages of system specification to maintaining the system after it has gone into use. In this definition, there are two key phrases:<br /> 1. ''Engineering discipline'' Engineers make things work. They apply theories, methods and tools where these are appropriate [. . .] Engineers also recognize that they must work to organizational and financial constraints. [. . .]<br /> 2. ''All aspects of software production'' Software engineering is not just concerned with the technical processes of software development but also with activities such as software project management and with the development of tools, methods and theories to support software production.
    }}
    \`\`\`

[^27]:
    \`\`\`{=mediawiki}
    {{cite journal| title= Software Engineering | journal = Information Processing | volume = 71 | pages = 530–538}}
    \`\`\`

[^28]:
    \`\`\`{=mediawiki}
    {{Cite web|url=https://www.merriam-webster.com/dictionary/software+engineering|title=Definition of SOFTWARE ENGINEERING|website=www.merriam-webster.com|language=en|access-date=2019-11-25}}
    \`\`\`

[^29]:
    \`\`\`{=mediawiki}
    {{cite book
    | last1=Winters | first1 =Titus | last2=Manshrec | first2=Tom | last3=Wright | first3=Hyrum
    | title=Software Engineering at Google | year=2020 | publisher= O'Reilly Media, Inc. | isbn=978-1-492-08279-8 | pages=xix–xx, 6–7 |chapter= Preface, Programming Over Time | quote=We propose that “software engineering” encompasses not just the act of writing code, but all of the tools and processes an organization uses to build and maintain that code over time. What practices can a software organization introduce that will best keep its code valuable over the long term? How can engineers make a codebase more sustainable and the software engineering discipline itself more rigorous?}}
    \`\`\`

[^30]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.micsymposium.org/mics_2002/SALAH.PDF|publisher=35th Annual Midwest Instruction and Computing Symposium|date=2002-04-05|access-date=2006-09-13|author=Akram I. Salah|title=Engineering an Academic Program in Software Engineering}}
    \`\`\`

    : \"For some, software engineering is just a glorified name for
    programming. If you are a programmer, you might put \'software
    engineer\' on your business card---never \'programmer\' though.\"

[^31]:
    Mills, Harlan D., J. R. Newman, and C. B. Engle, Jr., \"An
    Undergraduate Curriculum in Software Engineering,\" in
    \`{{cite book|title=Software Engineering Education: SEI Conference 1990, Pittsburgh, Pennsylvania, USA, April 2–3,...|first = Lionel E.|last=Deimel|year=1990|publisher=Springer|isbn=978-0-387-97274-9}}\`{=mediawiki},[p.
    26](https://books.google.com/books?id=ZuWbyy2blMEC&pg=PA26): \"As a
    practical matter, we regard software engineering as the necessary
    preparation for the practicing, software development and maintenance
    professional. The Computer Scientist is preparing for further
    theoretical studies\...\"

[^32]:
    \`\`\`{=mediawiki}
    {{cite journal |title=Realising evidence-based software engineering
    |author1=Barbara Kitchevnham
    |author2=David Budgen
    |author3=Pearl Brereton
    |author4=Stephen Linkman
    |journal=[[ACM SIGSOFT Software Engineering Notes]]
    |date=2005
    |volume=30
    |issue=4
    |pages=1–3
    |doi=10.1145/1082983.1083175
    |quote="We believe that software engineering can only advance as an engineering discipline by moving away from its current dependence upon advocacy and analysis, ..."}}
    \`\`\`

[^33]:
    \`\`\`{=mediawiki}
    {{Cite book|title=Fluency with information technology : skills, concepts, & capabilities|last=Lawrence|first=Snyder|isbn=978-0134448725|edition=[Seventh edition]|location=NY, NY|oclc=960641978|year = 2017}}
    \`\`\`

[^34]:
    \`\`\`{=mediawiki}
    {{cite journal | last = Parnas| first = David L.| author-link = David Parnas| year = 1998| title = Software Engineering Programmes are not Computer Science Programmes| journal = Annals of Software Engineering| volume = 6| pages = 19–37| doi = 10.1023/A:1018949113292| s2cid = 35786237| url=http://citeseer.ist.psu.edu/parnas98software.html}}
    \`\`\`

    , p. 19: \"Rather than treat software engineering as a subfield of
    computer science, I treat it as an element of the set, {Civil
    Engineering, Mechanical Engineering, Chemical Engineering,
    Electrical Engineering,\....}.\"

[^35]:
    \`\`\`{=mediawiki}
    {{cite journal | last = Parnas| first = David L.| year = 1998| title = Software Engineering Programmes are not Computer Science Programmes| journal = Annals of Software Engineering| volume = 6
    | pages = 19–37| doi = 10.1023/A:1018949113292| s2cid = 35786237| url=http://citeseer.ist.psu.edu/parnas98software.html}}
    \`\`\`

    , p. 20: \"This paper argues that the introduction of accredited
    professional programs in software engineering, programmes that are
    modelled on programmes in traditional engineering disciplines will
    help to increase both the quality and quantity of graduates who are
    well prepared, by their education, to develop trustworthy software
    products.\"

[^36]:
    \`\`\`{=mediawiki}
    {{cite book| last = McConnell| first = Steve| author-link = Steve McConnell| date = August 2003| title = Professional Software Development: Shorter Schedules, Better Projects, Superior Products, Enhanced Careers| publisher = Addison-Wesley| location = Boston, MA| isbn = 0-321-19367-9| url-access = registration| url = https://archive.org/details/professionalsoft00mcco_0}}
    \`\`\`

    , p. 39: \"In my opinion, the answer to that question is clear:
    Professional software development should be engineering. Is it? No.
    But should it be? Unquestionably, yes. \"

[^37]:
    \`\`\`{=mediawiki}
    {{cite journal|last=Knuth | first=Donald| author-link=Donald Knuth |year = 1974| title= Computer Programming as an Art | journal = Communications of the ACM | volume = 17 | issue = 12 | pages = 667–673 | url=http://disciplinas.lia.ufc.br/matdis061/arquivos/knuth-turingaward.pdf | doi=10.1145/361604.361612| s2cid=207685720| doi-access=free }}
    \`\`\`

    Transcript of the 1974 [Turing
    Award](Turing_Award 'Turing Award'){.wikilink} lecture.

[^38]:
    \`\`\`{=mediawiki}
    {{cite web| url = http://www.cs.utexas.edu/users/EWD/transcriptions/EWD11xx/EWD1165.html| title = There is still a war going on (manuscript Austin, 3 December 1993)| access-date = February 17, 2007 | last = Dijkstra | first = Edsger W| author-link = Edsger Dijkstra| author2=transcribed by Mario Béland | orig-year = First published December 3, 1993| date = November 23, 2004| work = E. W. Dijkstra Archive| publisher = The University of Texas at Austin, Department of Computer Sciences| quote = When the term was coined in 1968 by F.L. Bauer of the Technological University of Munich, I welcomed it. [. . .] I interpreted the introduction of the term "software engineering" as an apt reflection of the fact that the design of software systems was an activity par excellence for the mathematical engineer. [. . .]. As soon the term arrived in the USA, it was relieved of all its technical content. It had to be so for in its original meaning it was totally unacceptable [. . .] In the meantime, software engineering has become an almost empty term, as was nicely demonstrated by Data General who overnight promoted all its programmers to the exalted rank of "software engineer"! }}
    \`\`\`

[^39]:
    \`\`\`{=mediawiki}
    {{Cite web|date=2018-06-19|title=Software Engineering {{!}}
    \`\`\`

    Classification of Software
    Requirements\|url=<https://www.geeksforgeeks.org/software-engineering-classification-of-software-requirements/%7Caccess-date=2021-05-06%7Cwebsite=GeeksforGeeks%7Clanguage=en-us>}}

[^40]:
    \`\`\`{=mediawiki}
    {{Cite web|date=2019-05-24|title=Software Engineering {{!}}
    \`\`\`

    Software Design
    Process\|url=<https://www.geeksforgeeks.org/software-engineering-software-design-process/%7Caccess-date=2021-05-06%7Cwebsite=GeeksforGeeks%7Clanguage=en-us>}}

[^41]:

[^42]:

[^43]:

[^44]:

[^45]:

[^46]:

[^47]:

[^48]:
    \`\`\`{=mediawiki}
    {{Cite web|title=What is Software Maintenance? Definition of Software Maintenance, Software Maintenance Meaning|url=https://economictimes.indiatimes.com/definition/software-maintenance|access-date=2021-05-06|website=The Economic Times}}
    \`\`\`

[^49]:
    \`\`\`{=mediawiki}
    {{cite book |editor1=Alain Abran |editor2=James W. Moore |editor3=Pierre Bourque |editor4=Robert Dupuis |editor5=Leonard L. Tripp |title=Guide to the Software Engineering Body of Knowledge |publisher=[[IEEE Computer Society]] |date=2005 |url=http://www.computer.org/portal/web/swebok |access-date = 2010-09-13 |orig-year= 2004 |chapter=Chapter 1: Introduction to the Guide |chapter-url=http://www.computer.org/portal/web/swebok/html/ch1 |quote=The total volume of cited literature is intended to be suitable for mastery through the completion of an undergraduate education plus four years of experience. |archive-date=2016-05-09 |archive-url=https://web.archive.org/web/20160509154355/https://www.computer.org/portal/web/swebok |url-status= dead}}
    \`\`\`

[^50]:

[^51]:
    Cowling, A. J. 1999. The first decade of an undergraduate degree
    program in software engineering. Ann. Softw. Eng. 6, 1--4 (Apr.
    1999), 61--90.

[^52]:
    \`\`\`{=mediawiki}
    {{cite web|url=http://www.abet.org/accrediteac.asp|title=ABET Accredited Engineering Programs|date=April 3, 2007|access-date=April 3, 2007|archive-date=June 19, 2010|archive-url=https://web.archive.org/web/20100619233414/http://abet.org/accrediteac.asp|url-status=dead}}
    \`\`\`

[^53]:
    McConnell, Steve (July 10, 2003). _Professional Software
    Development: Shorter Schedules, Higher Quality Products, More
    Successful Projects, Enhanced Careers_.
    \`{{ISBN|978-0-321-19367-4}}\`{=mediawiki}.

[^54]:

[^55]:
    \`\`\`{=mediawiki}
    {{cite conference | first = N.S.W. | last = Williams | title = Professional Engineers Ontario's approach to licensing software engineering practitioners | book-title = Software Engineering Education and Training, 2001 Proceedings. 14th Conference on | pages = 77–78 | publisher = [[IEEE]]| date = 19–21 February 2001 | location = Charlotte, NC }}
    \`\`\`

[^56]:
    \`\`\`{=mediawiki}
    {{cite web| url = http://cdn1.ncees.co/wp-content/uploads/2012/11/Exam-specifications_PE-Software-Apr-2013.pdf| title = NCEES Software Engineering Exam Specifications| access-date = 2012-04-01| url-status = dead| archive-url = https://web.archive.org/web/20130827220334/http://cdn1.ncees.co/wp-content/uploads/2012/11/Exam-specifications_PE-Software-Apr-2013.pdf| archive-date = 2013-08-27}}
    \`\`\`

[^57]:
    \`\`\`{=mediawiki}
    {{cite web |title=NCEES discontinuing PE Software Engineering exam |url=https://ncees.org/ncees-discontinuing-pe-software-engineering-exam/ |publisher=National Council of Examiners for Engineering and Surveying |date=13 March 2018 |access-date=6 August 2018}}
    \`\`\`

[^58]:

[^59]:

[^60]:

[^61]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.computer.org/cms/Computer.org/Publications/code-of-ethics.pdf |title=''Software Engineering Code of Ethics'' |access-date=2012-03-25 |archive-date=2015-01-23 |archive-url=https://web.archive.org/web/20150123034610/http://www.computer.org/cms/Computer.org/Publications/code-of-ethics.pdf |url-status=dead }}
    \`\`\`

[^62]:
    \`\`\`{=mediawiki}
    {{cite web |last1=Labs |first1=Qubit |title=How Many Programmers are there in the World and in the US? [2023] |url=https://qubit-labs.com/how-many-programmers-in-the-world/ |website=Qubit Labs |access-date=7 February 2023 |date=29 November 2022}}
    \`\`\`

[^63]:
    \`\`\`{=mediawiki}
    {{cite web|url=http://evansdata.com/reports/viewRelease.php?reportID=9|title=Global Developer Population and Demographic Study 2016 V2|last=|first=|date=|website=|publisher=[[Evans Data Corporation]]|accessdate=19 January 2017}}
    \`\`\`

[^64]:

[^65]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.bls.gov/oco/ocos303.htm#training|title=Computer Software Engineers and Computer Programmers|access-date=2009-12-17}}
    \`\`\`

[^66]:
    \`\`\`{=mediawiki}
    {{cite web |title=Software Developers |url=https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm |work=Occupational Outlook Handbook |publisher=U. S. Bureau of labor Statistics |date=4 September 2019 |access-date=11 December 2019}}
    \`\`\`

[^67]:
    \`\`\`{=mediawiki}
    {{cite web |url=https://www.acm.org/binaries/content/assets/education/computing-disciplines.pdf |title=Computing Disciplines and Majors |publisher=[[Association for Computing Machinery]] |access-date=6 September 2019}}
    \`\`\`

[^68]:
    \`\`\`{=mediawiki}
    {{cite web|url=http://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm |title=Software Developers: Occupational Outlook Handbook |publisher=U.S. Bureau of Labor Statistics}}
    \`\`\`

[^69]:

[^70]:
    \`\`\`{=mediawiki}
    {{cite web |title=Computer Software Engineer |url=http://www.bls.gov/k12/computers04.htm |publisher=Bureau of Labor Statistics |date=March 19, 2010 |access-date=July 20, 2012 |archive-url=https://web.archive.org/web/20130726002354/http://www.bls.gov/k12/computers04.htm |archive-date=July 26, 2013}}
    \`\`\`

[^71]:
    \`\`\`{=mediawiki}
    {{cite web |title=Software Developers |url=http://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm |date=January 8, 2014 |publisher=Bureau of Labor Statistics |access-date=July 21, 2012}}
    \`\`\`

[^72]:

[^73]:
    \`\`\`{=mediawiki}
    {{cite web |url=https://www.bloomberg.com/opinion/articles/2020-08-04/big-tech-wants-you-to-believe-america-has-a-skills-gap |title=Tech Companies Want You to Believe America Has a Skills Gap |work=Bloomberg |last=Rosenthal |first=Rachel |date=August 4, 2020 |access-date=October 8, 2021 }}
    \`\`\`

[^74]:
    \`\`\`{=mediawiki}
    {{cite web|url=https://www.bls.gov/ooh/computer-and-information-technology/computer-programmers.htm|title=Computer Programmers : Occupational Outlook Handbook: : U.S. Bureau of Labor Statistics|access-date=17 January 2017|archive-date=3 May 2019|archive-url=https://web.archive.org/web/20190503144645/https://www.bls.gov/ooh/computer-and-information-technology/computer-programmers.htm|url-status=live}}
    \`\`\`

[^75]:

[^76]:

[^77]:
    \`\`\`{=mediawiki}
    {{cite web|url=https://www.bls.gov/opub/btn/archive/publication.htm#regional-reports|title=Archive By Publication : Beyond the Numbers: U.S. Bureau of Labor Statistics|website=www.bls.gov}}
    \`\`\`

[^78]:
    \`\`\`{=mediawiki}
    {{cite web|url=https://www.designnews.com/design-hardware-software/soon-be-extinct-embedded-software-engineer|title=The Soon-to-Be-Extinct Embedded Software Engineer|date=May 10, 2018|website=designnews.com}}
    \`\`\`

[^79]:
    \`\`\`{=mediawiki}
    {{cite web|url=https://developers.hp.com/public/blog/hp-international-womens-week-women-computer-science-dropping-1980s|title=hp's Developer Portal &#124; HP International Women's Week: Women in Computer Science dropping since 1980s|website=developers.hp.com}}
    \`\`\`

[^80]: \`{{Cite web |date=2023-04-06 |title=Software engineer jobs in danger due to ChatGPT-like tools? Here's what Google CEO Sundar Pichai has to say |url=https://www.businesstoday.in/technology/news/story/software-engineer-jobs-in-danger-due-to-chatgpt-like-tools-heres-what-google-ceo-sundar-pichai-has-to-say-376341-2023-04-06 |access-date=2023-05-12 |website=Business Today |language=en}}\`{=mediawiki}

[^81]: \`{{Cite web |last= |first= |last2= |first2= |last3= |first3= |date=2023-01-25 |title=ChatGPT could make these jobs obsolete |url=https://nypost.com/2023/01/25/chat-gpt-could-make-these-jobs-obsolete/ |access-date=2023-05-12 |language=en-US}}\`{=mediawiki}

[^82]: \`{{Cite web |last=Kay |first=Grace |title=Software engineers are panicking about being replaced by AI |url=https://www.businessinsider.com/software-engineers-tech-panicking-golden-age-over-chatgpt-ai-blind-2023-4 |access-date=2023-05-12 |website=Business Insider |language=en-US}}\`{=mediawiki}

[^83]: \`{{Cite web |last=Fowler |first=Gary |title=Council Post: How Will ChatGPT Affect Jobs? |url=https://www.forbes.com/sites/forbesbusinessdevelopmentcouncil/2023/03/16/how-will-chatgpt-affect-jobs/ |access-date=2023-05-12 |website=Forbes |language=en}}\`{=mediawiki}

[^84]: \`{{Cite web |last=Ito |first=Aki |title=ChatGPT spells the end of coding as we know it |url=https://www.businessinsider.com/chatgpt-ai-technology-end-of-coding-software-developers-jobs-2023-4 |access-date=2023-05-12 |website=Business Insider |language=en-US}}\`{=mediawiki}

[^85]: \`{{Cite web |last=Zinkula |first=Aaron Mok, Jacob |title=ChatGPT may be coming for our jobs. Here are the 10 roles that AI is most likely to replace. |url=https://www.businessinsider.com/chatgpt-jobs-at-risk-replacement-artificial-intelligence-ai-labor-trends-2023-02 |access-date=2023-05-12 |website=Business Insider |language=en-US}}\`{=mediawiki}

[^86]: \`{{Cite web |last=Cohen |first=Mikaela |title=These are the tech jobs most threatened by ChatGPT and A.I. |url=https://www.cnbc.com/2023/04/15/these-are-the-tech-jobs-most-threatened-by-chatgpt-and-ai.html |access-date=2023-05-12 |website=CNBC |date=15 April 2023 |language=en}}\`{=mediawiki}

[^87]:

[^88]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.sei.cmu.edu/certification/ |title=SEI certification page |publisher=Sei.cmu.edu |access-date=2012-03-25}}
    \`\`\`

[^89]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.informit.com/articles/article.aspx?p=1180991|title=The Top 10 Problems with IT Certification in 2008|last=Wyrostek|first=Warren |date=March 14, 2008|work=InformIT|access-date=2009-03-03}}
    \`\`\`

[^90]:
    \`\`\`{=mediawiki}
    {{cite web |author=[[IEEE Computer Society]]|url=http://www.ifip.org/minutes/GA2006/Tab18b-US-IEEE.pdf|title=2006 IEEE computer society report to the IFIP General Assembly|access-date=2007-04-10}}
    \`\`\`

[^91]:
    \`\`\`{=mediawiki}
    {{cite web |author=IEEE|url=http://www.computer.org/portal/web/certification/csda|title=CSDA|access-date=2010-04-20}}
    \`\`\`

[^92]: \`{{cite web |author=Barbara Simons |title=Past ACM Presidents Reflect on Their Service to ACM |series=Celebrating 75 Years of Advancing Computing as a Science & Profession |url=https://www.acm.org/75th-anniversary/past-presidents/barbara-simons |access-date=May 18, 2024 |publisher=[[Association for Computing Machinery]] |quote=After the panels’ recommendations were submitted, ACM Council concluded that the framework of a licensed professional engineer, originally developed for civil engineers, does not match the professional industrial practice of software engineering and would preclude many of the most qualified software engineers from becoming licensed.}}\`{=mediawiki}

[^93]:
    \`\`\`{=mediawiki}
    {{cite journal |author1=John C. Knight
    |author2=Nancy G. Leveson
    |title=Should software engineers be licensed?
    |journal=[[Communications of the ACM]]
    |volume=45
    |issue=11
    |pages=87–90
    |doi=10.1145/581571.581601
    |date=November 1, 2002}}
    \`\`\`

[^94]:
    \`\`\`{=mediawiki}
    {{cite web |author=Canadian Information Processing Society|url=http://www.cips.ca/standards/isp|title=I.S.P. Designation|access-date=2007-03-15}}
    \`\`\`

[^95]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.peo.on.ca |title=Professional Engineers Ontario: Welcome to PEO's website |publisher=Peo.on.ca |access-date=2012-03-25}}
    \`\`\`

[^96]:
    \`\`\`{=mediawiki}
    {{cite web |first=Patrick|last=Thibodaux|url=http://www.computerworld.com/article/2555175/it-careers/as-outsourcing-gathers-steam--computer-science-interest-wanes.html |title=As outsourcing gathers steam, computer science interest wanes |publisher=Computerworld.com |date=2006-05-05 |access-date=2016-12-06}}
    \`\`\`

[^97]:
    \`\`\`{=mediawiki}
    {{cite web |title=Software developer growth slows in North America: Study shows Asia will lead in software developer jobs by 2010 |author=Robert Mullins |date=March 13, 2007 |website=InfoWorld |series=Software Development |url=https://www.infoworld.com/article/2660992/software-developer-growth-slows-in-north-america.html}}
    \`\`\`

[^98]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.cognizant.com/html/content/news/GartnerMQ_Cognizant.pdf |title=Gartner Magic Quadrant |publisher=Cognizant.com |access-date=2012-03-25 |archive-date=2008-09-20 |archive-url=https://web.archive.org/web/20080920182857/http://www.cognizant.com/html/content/news/GartnerMQ_Cognizant.pdf |url-status=dead }}
    \`\`\`

[^99]:
    \`\`\`{=mediawiki}
    {{cite journal |last=Casey |first=Valentine |title=Virtual software team project management|journal=Journal of the Brazilian Computer Society |volume=16 |issue=2 |pages=83–96 |date=2010-08-20 |doi=10.1007/s13173-010-0013-3 |s2cid=14383734 |url=http://eprints.dkit.ie/116/1/VCaseyRevisedVersion.doc |doi-access=free }}
    \`\`\`

[^100]:
    \`\`\`{=mediawiki}
    {{cite web |title=Outstanding Research Award |website=[[ACM SIGSOFT|SIGSOFT]] |url=https://www2.sigsoft.org/awards/outstandingresearch |access-date=1 April 2024}}
    \`\`\`

[^101]:
    \`\`\`{=mediawiki}
    {{cite web |title=SIGSOFT Awards 2024 |author1=David Lo ([[ACM SIGSOFT|SIGSOFT]] Awards Chair) |author2=Thomas Zimmermann ([[ACM SIGSOFT|SIGSOFT]] Chair) |website=[[ACM SIGSOFT]] Blog |url=https://sigsoft.medium.com/sigsoft-awards-2024-ce34b9ee23a6 |date=17 January 2024 |access-date=1 April 2024}}
    \`\`\`

[^102]:
    \`\`\`{=mediawiki}
    {{cite web |title=ICSE Most Influential Paper Award |url=https://www.sigsoft.org/awards/icseMIPAward.html |publisher=[[ACM SIGSOFT]]}}
    \`\`\`

[^103]:
    \`\`\`{=mediawiki}
    {{cite journal
    |title=Viewpoint: taking the lead in licensing software engineers
    |author=Donald J. Bagert
    |journal=[[Communications of the ACM]]
    |date= April 1999
    |volume=42
    |issue=4
    |pages=27–29
    |doi=10.1145/299157.299163}}
    \`\`\`

    \`\`\`{=mediawiki}
    {{open access}}
    \`\`\`

[^104]:
    \`\`\`{=mediawiki}
    {{cite journal
    |author=[[Barry Boehm]]
    |title=Software engineering is a value-based contact sport
    |journal=[[IEEE Software]]
    |volume=19
    |number=5
    |pages=95–96
    |date=September–October 2002
    |doi=10.1109/MS.2002.1032863}}
    \`\`\`

[^105]:
`,
  },
  {
    title: 'Test-driven Development.md',
    content: `
\`\`\`{=mediawiki}
{{Short description|Method of writing code}}
\`\`\`

\`\`\`{=mediawiki}
{{Software development process}}
\`\`\`

**Test-driven development** (**TDD**) is a way of writing
[code](source_code 'code'){.wikilink} that involves writing an
[automated](test_automation 'automated'){.wikilink}
[unit-level](unit_testing 'unit-level'){.wikilink} [test
case](test_case 'test case'){.wikilink} that fails, then writing just
enough code to make the test pass, then
[refactoring](refactoring 'refactoring'){.wikilink} both the test code
and the production code, then repeating with another new test case.

Alternative approaches to writing automated tests is to write all of the
production code before starting on the test code or to write all of the
test code before starting on the production code. With TDD, both are
written together, therefore shortening debugging time necessities.[^1]

TDD is related to the test-first programming concepts of [extreme
programming](extreme_programming 'extreme programming'){.wikilink},
begun in 1999,[^2] but more recently has created more general interest
in its own right.[^3]

Programmers also apply the concept to improving and
[debugging](software_bug 'debugging'){.wikilink} [legacy
code](legacy_code 'legacy code'){.wikilink} developed with older
techniques.[^4]

## History

Software engineer [Kent Beck](Kent_Beck 'Kent Beck'){.wikilink}, who is
credited with having developed or \"rediscovered\"[^5] the technique,
stated in 2003 that TDD encourages simple designs and inspires
confidence.[^6]

\`\`\`{=mediawiki}
{{Blockquote
| text      = The original description of TDD was in an ancient book about programming. It said you take the input tape, manually type in the output tape you expect, then program until the actual output tape matches the expected output. After I'd written the first xUnit framework in [[Smalltalk]] I remembered reading this and tried it out. That was the origin of TDD for me. When describing TDD to older programmers, I often hear, "Of course. How else could you program?" Therefore I refer to my role as "rediscovering" TDD.
| author    = [[Kent Beck]]
| title     =
| source    = "Why does Kent Beck refer to the 'rediscovery' of test-driven development? What's the history of test-driven development before Kent Beck's rediscovery?"<ref>{{cite web|url=http://www.quora.com/Why-does-Kent-Beck-refer-to-the-rediscovery-of-test-driven-development |title=Why does Kent Beck refer to the "rediscovery" of test-driven development? |author=Kent Beck | date=May 11, 2012 |access-date=December 1, 2014}}</ref>
}}
\`\`\`

## Coding cycle {#coding_cycle}

![A graphical representation of the test-driven development
lifecycle](TDD_Global_Lifecycle.png 'A graphical representation of the test-driven development lifecycle')

The TDD steps vary somewhat by author in count and description, but are
generally as follows. These are based on the book _Test-Driven
Development by Example_,[^7] and Kent Beck\'s Canon TDD article.[^8]

1\. List scenarios for the new feature
: List the expected variants in the new behavior. "There's the basic
case & then what-if this service times out & what-if the key isn't
in the database yet &..." The developer can discover these
specifications by asking about [use
cases](use_case 'use case'){.wikilink} and [user
stories](user_story 'user stories'){.wikilink}. A key benefit of TDD
is that it makes the developer focus on requirements _before_
writing code. This is in contrast with the usual practice, where
unit tests are only written _after_ code.

2\. Write a test for an item on the list
: Write an automated test that _would_ pass if the variant in the new
behavior is met.

3\. Run all tests. The new test should _fail_ \`{{endash}}\`{=mediawiki} for _expected_ reasons
: This shows that new code is actually needed for the desired feature.
It validates that the [test
harness](test_harness 'test harness'){.wikilink} is working
correctly. It rules out the possibility that the new test is flawed
and will always pass.

4\. Write the simplest code that passes the new test
: Inelegant code and [hard
coding](hard_coding 'hard coding'){.wikilink} is acceptable. The
code will be honed in Step 6. No code should be added beyond the
tested functionality.

5\. All tests should now pass
: If any fail, fix failing tests with minimal changes until all pass.

6\. Refactor as needed while ensuring all tests continue to pass
: Code is [refactored](Code_refactoring 'refactored'){.wikilink} for
[readability](Code_readability 'readability'){.wikilink} and
maintainability. In particular, hard-coded test data should be
removed from the production code. Running the test suite after each
refactor ensures that no existing functionality is broken. Examples
of refactoring: - moving code to where it most logically belongs - removing [duplicate
code](duplicate_code 'duplicate code'){.wikilink} - making [names](<Identifier_(computer_languages)> 'names'){.wikilink}
[self-documenting](Self-documenting_code 'self-documenting'){.wikilink} - splitting methods into smaller pieces - re-arranging [inheritance
hierarchies](<Inheritance_(object-oriented_programming)> 'inheritance hierarchies'){.wikilink}

Repeat
: Repeat the process, starting at step 2, with each test on the list
until all tests are implemented and passing.

Each tests should be small and commits made often. If new code fails
some tests, the programmer can [undo](undo 'undo'){.wikilink} or revert
rather than [debug](debug 'debug'){.wikilink} excessively.

When using [external
libraries](<Library_(computing)> 'external libraries'){.wikilink}, it is
important not to write tests that are so small as to effectively test
merely the library itself,[^9] unless there is some reason to believe
that the library is buggy or not feature-rich enough to serve all the
needs of the software under development.

## Test-driven work {#test_driven_work}

TDD has been adopted outside of software development, in both product
and service teams, as **test-driven work**.[^10] For testing to be
successful, it needs to be practiced at the micro and macro levels.
Every method in a class, every input data value, log message, and error
code, amongst other data points, need to be tested.[^11] Similar to TDD,
non-software teams develop [quality
control](quality_control 'quality control'){.wikilink} (QC) checks
(usually manual tests rather than automated tests) for each aspect of
the work prior to commencing. These QC checks are then used to inform
the design and validate the associated outcomes. The six steps of the
TDD sequence are applied with minor semantic changes:

1.  \"Add a check\" replaces \"Add a test\"
2.  \"Run all checks\" replaces \"Run all tests\"
3.  \"Do the work\" replaces \"Write some code\"
4.  \"Run all checks\" replaces \"Run tests\"
5.  \"Clean up the work\" replaces \"Refactor code\"
6.  \"Repeat\"

## Development style {#development_style}

There are various aspects to using test-driven development, for example
the principles of \"keep it simple, stupid\"
([KISS](KISS_principle 'KISS'){.wikilink}) and \"[You aren\'t gonna need
it](You_aren't_gonna_need_it "You aren't gonna need it"){.wikilink}\"
(YAGNI). By focusing on writing only the code necessary to pass tests,
designs can often be cleaner and clearer than is achieved by other
methods.[^12] In _Test-Driven Development by Example_, Kent Beck also
suggests the principle \"[Fake it till you make
it](Fake_it_till_you_make_it 'Fake it till you make it'){.wikilink}\".

To achieve some advanced design concept such as a [design
pattern](design_pattern 'design pattern'){.wikilink}, tests are written
that generate that design. The code may remain simpler than the target
pattern, but still pass all required tests. This can be unsettling at
first but it allows the developer to focus only on what is important.

Writing the tests first: The tests should be written before the
functionality that is to be tested. This has been claimed to have many
benefits. It helps ensure that the application is written for
testability, as the developers must consider how to test the application
from the outset rather than adding it later. It also ensures that tests
for every feature gets written. Additionally, writing the tests first
leads to a deeper and earlier understanding of the product requirements,
ensures the effectiveness of the test code, and maintains a continual
focus on [software
quality](software_quality 'software quality'){.wikilink}.[^13] When
writing feature-first code, there is a tendency by developers and
organizations to push the developer on to the next feature, even
neglecting testing entirely. The first TDD test might not even compile
at first, because the classes and methods it requires may not yet exist.
Nevertheless, that first test functions as the beginning of an
executable specification.[^14]

Each test case fails initially: This ensures that the test really works
and can catch an error. Once this is shown, the underlying functionality
can be implemented. This has led to the \"test-driven development
mantra\", which is \"red/green/refactor\", where red means _fail_ and
green means _pass_. Test-driven development constantly repeats the steps
of adding test cases that fail, passing them, and refactoring. Receiving
the expected test results at each stage reinforces the developer\'s
mental model of the code, boosts confidence and increases productivity.

### Code visibility {#code_visibility}

Test code needs access to the code it is testing, but testing should not
compromise normal design goals such as [information
hiding](information_hiding 'information hiding'){.wikilink},
encapsulation and the [separation of
concerns](separation_of_concerns 'separation of concerns'){.wikilink}.
Therefore, unit test code is usually located in the same project or
[module](<Module_(programming)> 'module'){.wikilink} as the code being
tested.

In [object oriented
design](object_oriented_design 'object oriented design'){.wikilink} this
still does not provide access to private data and methods. Therefore,
extra work may be necessary for unit tests. In
[Java](<Java_(programming_language)> 'Java'){.wikilink} and other
languages, a developer can use
[reflection](<Reflection_(computer_science)> 'reflection'){.wikilink} to
access private fields and methods.[^15] Alternatively, an [inner
class](inner_class 'inner class'){.wikilink} can be used to hold the
unit tests so they have visibility of the enclosing class\'s members and
attributes. In the [.NET
Framework](.NET_Framework '.NET Framework'){.wikilink} and some other
programming languages, [partial
classes](partial_class 'partial class'){.wikilink} may be used to expose
private methods and data for the tests to access.

It is important that such testing hacks do not remain in the production
code. In [C](<C_(programming_language)> 'C'){.wikilink} and other
languages, [compiler
directives](<Directive_(programming)> 'compiler directives'){.wikilink}
such as \`#if DEBUG ... #endif\` can be placed around such additional
classes and indeed all other test-related code to prevent them being
compiled into the released code. This means the released code is not
exactly the same as what was unit tested. The regular running of fewer
but more comprehensive, end-to-end, integration tests on the final
release build can ensure (among other things) that no production code
exists that subtly relies on aspects of the test harness.

There is some debate among practitioners of TDD, documented in their
blogs and other writings, as to whether it is wise to test private
methods and data anyway. Some argue that private members are a mere
implementation detail that may change, and should be allowed to do so
without breaking numbers of tests. Thus it should be sufficient to test
any class through its public interface or through its subclass
interface, which some languages call the \"protected\" interface.[^16]
Others say that crucial aspects of functionality may be implemented in
private methods and testing them directly offers advantage of smaller
and more direct unit tests.[^17][^18]

### Fakes, mocks and integration tests {#fakes_mocks_and_integration_tests}

Unit tests are so named because they each test _one unit_ of code. A
complex module may have a thousand unit tests and a simple module may
have only ten. The unit tests used for TDD should never cross process
boundaries in a program, let alone network connections. Doing so
introduces delays that make tests run slowly and discourage developers
from running the whole suite. Introducing dependencies on external
modules or data also turns _unit tests_ into _integration tests_. If one
module misbehaves in a chain of interrelated modules, it is not so
immediately clear where to look for the cause of the failure.

When code under development relies on a database, a web service, or any
other external process or service, enforcing a unit-testable separation
is also an opportunity and a driving force to design more modular, more
testable and more reusable code.[^19] Two steps are necessary:

1.  Whenever external access is needed in the final design, an
    [interface](<Interface_(computer_science)> 'interface'){.wikilink}
    should be defined that describes the access available. See the
    [dependency inversion
    principle](dependency_inversion_principle 'dependency inversion principle'){.wikilink}
    for a discussion of the benefits of doing this regardless of TDD.
2.  The interface should be implemented in two ways, one of which really
    accesses the external process, and the other of which is a [fake or
    mock](mock_object 'fake or mock'){.wikilink}. Fake objects need do
    little more than add a message such as \"Person object saved\" to a
    [trace log](<Tracing_(software)> 'trace log'){.wikilink}, against
    which a test
    [assertion](<Assertion_(computing)> 'assertion'){.wikilink} can be run
    to verify correct behaviour. Mock objects differ in that they
    themselves contain [test
    assertions](<Assertion_(computing)> 'test assertions'){.wikilink} that
    can make the test fail, for example, if the person\'s name and other
    data are not as expected.

Fake and mock object methods that return data, ostensibly from a data
store or user, can help the test process by always returning the same,
realistic data that tests can rely upon. They can also be set into
predefined fault modes so that error-handling routines can be developed
and reliably tested. In a fault mode, a method may return an invalid,
incomplete or [null](Null_character 'null'){.wikilink} response, or may
throw an [exception](Exception_handling 'exception'){.wikilink}. Fake
services other than data stores may also be useful in TDD: A fake
encryption service may not, in fact, encrypt the data passed; a fake
random number service may always return 1. Fake or mock implementations
are examples of [dependency
injection](dependency_injection 'dependency injection'){.wikilink}.

A test double is a test-specific capability that substitutes for a
system capability, typically a class or function, that the UUT depends
on. There are two times at which test doubles can be introduced into a
system: link and execution. Link time substitution is when the test
double is compiled into the load module, which is executed to validate
testing. This approach is typically used when running in an environment
other than the target environment that requires doubles for the hardware
level code for compilation. The alternative to linker substitution is
run-time substitution in which the real functionality is replaced during
the execution of a test case. This substitution is typically done
through the reassignment of known function pointers or object
replacement.

Test doubles are of a number of different types and varying
complexities:

- [Dummy](Dummy_code 'Dummy'){.wikilink} -- A dummy is the simplest form
  of a test double. It facilitates linker time substitution by providing
  a default return value where required.
- [Stub](Method_stub 'Stub'){.wikilink} -- A stub adds simplistic logic
  to a dummy, providing different outputs.
- Spy -- A spy captures and makes available parameter and state
  information, publishing accessors to test code for private information
  allowing for more advanced state validation.
- [Mock](Mock_object 'Mock'){.wikilink} -- A mock is specified by an
  individual test case to validate test-specific behavior, checking
  parameter values and call sequencing.
- Simulator -- A simulator is a comprehensive component providing a
  higher-fidelity approximation of the target capability (the thing
  being doubled). A simulator typically requires significant additional
  development effort.[^20]

A corollary of such dependency injection is that the actual database or
other external-access code is never tested by the TDD process itself. To
avoid errors that may arise from this, other tests are needed that
instantiate the test-driven code with the \"real\" implementations of
the interfaces discussed above. These are [integration
tests](Integration_testing 'integration tests'){.wikilink} and are quite
separate from the TDD unit tests. There are fewer of them, and they must
be run less often than the unit tests. They can nonetheless be
implemented using the same testing framework.

Integration tests that alter any [persistent
store](persistent_storage 'persistent store'){.wikilink} or database
should always be designed carefully with consideration of the initial
and final state of the files or database, even if any test fails. This
is often achieved using some combination of the following techniques:

- The \`TearDown\` method, which is integral to many test frameworks.
- \`try...catch...finally\` [exception
  handling](exception_handling 'exception handling'){.wikilink}
  structures where available.
- [Database
  transactions](Database_transactions 'Database transactions'){.wikilink}
  where a transaction
  [atomically](<atomicity_(database_systems)> 'atomically'){.wikilink}
  includes perhaps a write, a read and a matching delete operation.
- Taking a \"snapshot\" of the database before running any tests and
  rolling back to the snapshot after each test run. This may be
  automated using a framework such as [Ant](Apache_Ant 'Ant'){.wikilink}
  or [NAnt](NAnt 'NAnt'){.wikilink} or a [continuous
  integration](continuous_integration 'continuous integration'){.wikilink}
  system such as
  [CruiseControl](CruiseControl 'CruiseControl'){.wikilink}.
- Initialising the database to a clean state _before_ tests, rather than
  cleaning up _after_ them. This may be relevant where cleaning up may
  make it difficult to diagnose test failures by deleting the final
  state of the database before detailed diagnosis can be performed.

### Keep the unit small {#keep_the_unit_small}

For TDD, a unit is most commonly defined as a class, or a group of
related functions often called a module. Keeping units relatively small
is claimed to provide critical benefits, including:

- Reduced debugging effort -- When test failures are detected, having
  smaller units aids in tracking down errors.
- Self-documenting tests -- Small test cases are easier to read and to
  understand.[^21]

Advanced practices of test-driven development can lead to [acceptance
test--driven
development](acceptance_test–driven_development 'acceptance test–driven development'){.wikilink}
(ATDD) and [specification by
example](specification_by_example 'specification by example'){.wikilink}
where the criteria specified by the customer are automated into
acceptance tests, which then drive the traditional unit test-driven
development (UTDD) process.[^22] This process ensures the customer has
an automated mechanism to decide whether the software meets their
requirements. With ATDD, the development team now has a specific target
to satisfy -- the acceptance tests -- which keeps them continuously
focused on what the customer really wants from each user story.

## Best practices {#best_practices}

### Test structure {#test_structure}

Effective layout of a test case ensures all required actions are
completed, improves the readability of the test case, and smooths the
flow of execution. Consistent structure helps in building a
self-documenting test case. A commonly applied structure for test cases
has (1) setup, (2) execution, (3) validation, and (4) cleanup.

- Setup: Put the Unit Under Test (UUT) or the overall test system in the
  state needed to run the test.
- Execution: Trigger/drive the UUT to perform the target behavior and
  capture all output, such as return values and output parameters. This
  step is usually very simple.
- Validation: Ensure the results of the test are correct. These results
  may include explicit outputs captured during execution or state
  changes in the UUT.
- Cleanup: Restore the UUT or the overall test system to the pre-test
  state. This restoration permits another test to execute immediately
  after this one. In some cases, in order to preserve the information
  for possible test failure analysis, the cleanup should be starting the
  test just before the test\'s setup run. [^23]

### Individual best practices {#individual_best_practices}

Some best practices that an individual could follow would be to separate
common set-up and tear-down logic into test support services utilized by
the appropriate test cases, to keep each [test
oracle](test_oracle 'test oracle'){.wikilink} focused on only the
results necessary to validate its test, and to design time-related tests
to allow tolerance for execution in non-real time operating systems. The
common practice of allowing a 5-10 percent margin for late execution
reduces the potential number of false negatives in test execution. It is
also suggested to treat test code with the same respect as production
code. Test code must work correctly for both positive and negative
cases, last a long time, and be readable and maintainable. Teams can get
together and review tests and test practices to share effective
techniques and catch bad habits.[^24]

### Practices to avoid, or \"anti-patterns\" {#practices_to_avoid_or_anti_patterns}

\`\`\`{=mediawiki}
{{see also|Anti-pattern}}
\`\`\`

- Having test cases depend on system state manipulated from previously
  executed test cases (i.e., you should always start a unit test from a
  known and pre-configured state).
- Dependencies between test cases. A test suite where test cases are
  dependent upon each other is brittle and complex. Execution order
  should not be presumed. Basic refactoring of the initial test cases or
  structure of the UUT causes a spiral of increasingly pervasive impacts
  in associated tests.
- Interdependent tests. Interdependent tests can cause cascading false
  negatives. A failure in an early test case breaks a later test case
  even if no actual fault exists in the UUT, increasing defect analysis
  and debug efforts.
- Testing precise execution, behavior, timing or performance.
- Building \"all-knowing oracles\". An oracle that inspects more than
  necessary is more expensive and brittle over time. This very common
  error is dangerous because it causes a subtle but pervasive time sink
  across the complex
  project.[^25]\`{{Clarify|reason=needs better explanation, what is an all-knowing oracle? needs better tone, more factual|date=February 2022}}\`{=mediawiki}
- Testing implementation details.
- Slow running tests.

## Comparison and demarcation {#comparison_and_demarcation}

### TDD and ATDD {#tdd_and_atdd}

Test-driven development is related to, but different from [acceptance
test--driven
development](acceptance_test–driven_development 'acceptance test–driven development'){.wikilink}
(ATDD).[^26] TDD is primarily a developer\'s tool to help create
well-written unit of code (function, class, or module) that correctly
performs a set of operations. ATDD is a communication tool between the
customer, developer, and tester to ensure that the requirements are
well-defined. TDD requires test automation. ATDD does not, although
automation helps with regression testing. Tests used in TDD can often be
derived from ATDD tests, since the code units implement some portion of
a requirement. ATDD tests should be readable by the customer. TDD tests
do not need to be.

### TDD and BDD {#tdd_and_bdd}

BDD ([behavior-driven
development](behavior-driven_development 'behavior-driven development'){.wikilink})
combines practices from TDD and from ATDD.[^27] It includes the practice
of writing tests first, but focuses on tests which describe behavior,
rather than tests which test a unit of implementation. Tools such as
[JBehave](JBehave 'JBehave'){.wikilink},
[Cucumber](<Cucumber_(software)> 'Cucumber'){.wikilink},
[Mspec](Mspec 'Mspec'){.wikilink} and
[Specflow](Specflow 'Specflow'){.wikilink} provide syntaxes which allow
product owners, developers and test engineers to define together the
behaviors which can then be translated into automated tests.

## Software for TDD {#software_for_tdd}

There are many testing frameworks and tools that are useful in TDD.

### xUnit frameworks {#xunit_frameworks}

Developers may use computer-assisted [testing
frameworks](list_of_unit_testing_frameworks 'testing frameworks'){.wikilink},
commonly collectively named [xUnit](xUnit 'xUnit'){.wikilink} (which are
derived from SUnit, created in 1998), to create and automatically run
the test cases. xUnit frameworks provide assertion-style test validation
capabilities and result reporting. These capabilities are critical for
automation as they move the burden of execution validation from an
independent post-processing activity to one that is included in the test
execution. The execution framework provided by these test frameworks
allows for the automatic execution of all system test cases or various
subsets along with other features.[^28]

### TAP results {#tap_results}

Testing frameworks may accept unit test output in the language-agnostic
[Test Anything
Protocol](Test_Anything_Protocol 'Test Anything Protocol'){.wikilink}
created in 1987.

## TDD for complex systems {#tdd_for_complex_systems}

Exercising TDD on large, challenging systems requires a modular
architecture, well-defined components with published interfaces, and
disciplined system layering with maximization of platform independence.
These proven practices yield increased testability and facilitate the
application of build and test automation.[^29]

### Designing for testability {#designing_for_testability}

Complex systems require an architecture that meets a range of
requirements. A key subset of these requirements includes support for
the complete and effective testing of the system. Effective modular
design yields components that share traits essential for effective TDD.

- [High
  Cohesion](<Cohesion_(computer_science)> 'High Cohesion'){.wikilink}
  ensures each unit provides a set of related capabilities and makes the
  tests of those capabilities easier to maintain.
- [Low
  Coupling](<Coupling_(computer_programming)> 'Low Coupling'){.wikilink}
  allows each unit to be effectively tested in isolation.
- Published Interfaces restrict Component access and serve as contact
  points for tests, facilitating test creation and ensuring the highest
  fidelity between test and production unit configuration.

A key technique for building effective modular architecture is Scenario
Modeling where a set of sequence charts is constructed, each one
focusing on a single system-level execution scenario. The Scenario Model
provides an excellent vehicle for creating the strategy of interactions
between components in response to a specific stimulus. Each of these
Scenario Models serves as a rich set of requirements for the services or
functions that a component must provide, and it also dictates the order
in which these components and services interact together. Scenario
modeling can greatly facilitate the construction of TDD tests for a
complex system.[^30]

### Managing tests for large teams {#managing_tests_for_large_teams}

In a larger system, the impact of poor component quality is magnified by
the complexity of interactions. This magnification makes the benefits of
TDD accrue even faster in the context of larger projects. However, the
complexity of the total population of tests can become a problem in
itself, eroding potential gains. It sounds simple, but a key initial
step is to recognize that test code is also important software and
should be produced and maintained with the same rigor as the production
code.

Creating and managing the
[architecture](Software_architecture 'architecture'){.wikilink} of test
software within a complex system is just as important as the core
product architecture. Test drivers interact with the UUT, [test
doubles](test_double 'test double'){.wikilink} and the unit test
framework.[^31]

## Advantages and Disadvantages of Test Driven Development {#advantages_and_disadvantages_of_test_driven_development}

### Advantages

Test Driven Development (TDD) is a software development approach where
tests are written before the actual code. It offers several advantages:

1.  **Comprehensive Test Coverage**: TDD ensures that all new code is
    covered by at least one test, leading to more robust software.
2.  **Enhanced Confidence in Code**: Developers gain greater confidence
    in the code\'s reliability and functionality.
3.  **Enhanced Confidence in Tests**: As the tests are known to be
    failing without the proper implementation, we know that the tests
    actually tests the implementation correctly.
4.  **Well-Documented Code**: The process naturally results in
    well-documented code, as each test clarifies the purpose of the code
    it tests.
5.  **Requirement Clarity**: TDD encourages a clear understanding of
    requirements before coding begins.
6.  **Facilitates Continuous Integration**: It integrates well with
    continuous integration processes, allowing for frequent code updates
    and testing.
7.  **Boosts Productivity**: Many developers find that TDD increases
    their productivity.
8.  **Reinforces Code Mental Model**: TDD helps in building a strong
    mental model of the code\'s structure and behavior.
9.  **Emphasis on Design and Functionality**: It encourages a focus on
    the design, interface, and overall functionality of the program.
10. **Reduces Need for Debugging**: By catching issues early in the
    development process, TDD reduces the need for extensive debugging
    later.
11. **System Stability**: Applications developed with TDD tend to be
    more stable and less prone to bugs.[^32]

### Disadvantages

However, TDD is not without its drawbacks:

1.  **Increased Code Volume**: Implementing TDD can result in a larger
    codebase as tests add to the total amount of code written.
2.  **False Security from Tests**: A large number of passing tests can
    sometimes give a misleading sense of security regarding the code\'s
    robustness.[^33]
3.  **Maintenance Overheads**: Maintaining a large suite of tests can
    add overhead to the development process.
4.  **Time-Consuming Test Processes**: Writing and maintaining tests can
    be time-consuming.
5.  **Testing Environment Set-Up**: TDD requires setting up and
    maintaining a suitable testing environment.
6.  **Learning Curve**: It takes time and effort to become proficient in
    TDD practices.
7.  **Overcomplication**: An overemphasis on TDD can lead to code that
    is more complex than necessary.
8.  **Neglect of Overall Design**: Focusing too narrowly on passing
    tests can sometimes lead to neglect of the bigger picture in
    software design.
9.  **Increased Costs**: The additional time and resources required for
    TDD can result in higher development costs.

### Benefits

A 2005 study found that using TDD meant writing more tests and, in turn,
programmers who wrote more tests tended to be more productive.[^34]
Hypotheses relating to code quality and a more direct correlation
between TDD and productivity were inconclusive.[^35]

Programmers using pure TDD on new
(\"[greenfield](Greenfield_project 'greenfield'){.wikilink}\") projects
reported they only rarely felt the need to invoke a
[debugger](debugger 'debugger'){.wikilink}. Used in conjunction with a
[version control
system](version_control_system 'version control system'){.wikilink},
when tests fail unexpectedly, reverting the code to the last version
that passed all tests may often be more productive than debugging.[^36]

Test-driven development offers more than just simple validation of
correctness, but can also drive the design of a program.[^37] By
focusing on the test cases first, one must imagine how the functionality
is used by clients (in the first case, the test cases). So, the
programmer is concerned with the interface before the implementation.
This benefit is complementary to [design by
contract](design_by_contract 'design by contract'){.wikilink} as it
approaches code through test cases rather than through mathematical
assertions or preconceptions.

Test-driven development offers the ability to take small steps when
required. It allows a programmer to focus on the task at hand as the
first goal is to make the test pass. Exceptional cases and error
handling are not considered initially, and tests to create these
extraneous circumstances are implemented separately. Test-driven
development ensures in this way that all written code is covered by at
least one test. This gives the programming team, and subsequent users, a
greater level of confidence in the code.

While it is true that more code is required with TDD than without TDD
because of the unit test code, the total code implementation time could
be shorter based on a model by Müller and Padberg.[^38] Large numbers of
tests help to limit the number of defects in the code. The early and
frequent nature of the testing helps to catch defects early in the
development cycle, preventing them from becoming endemic and expensive
problems. Eliminating defects early in the process usually avoids
lengthy and tedious debugging later in the project.

TDD can lead to more modularized, flexible, and extensible code. This
effect often comes about because the methodology requires that the
developers think of the software in terms of small units that can be
written and tested independently and integrated together later. This
leads to smaller, more focused classes, looser
[coupling](<Coupling_(computer_programming)> 'coupling'){.wikilink}, and
cleaner interfaces. The use of the [mock
object](mock_object 'mock object'){.wikilink} design pattern also
contributes to the overall modularization of the code because this
pattern requires that the code be written so that modules can be
switched easily between mock versions for unit testing and \"real\"
versions for deployment.

Because no more code is written than necessary to pass a failing test
case, automated tests tend to cover every code path. For example, for a
TDD developer to add an \`else\` branch to an existing \`if\` statement, the
developer would first have to write a failing test case that motivates
the branch. As a result, the automated tests resulting from TDD tend to
be very thorough: they detect any unexpected changes in the code\'s
behaviour. This detects problems that can arise where a change later in
the development cycle unexpectedly alters other functionality.

Madeyski[^39] provided empirical evidence (via a series of laboratory
experiments with over 200 developers) regarding the superiority of the
TDD practice over the traditional Test-Last approach or testing for
correctness approach, with respect to the lower coupling between objects
(CBO). The mean effect size represents a medium (but close to large)
effect on the basis of meta-analysis of the performed experiments which
is a substantial finding. It suggests a better modularization (i.e., a
more modular design), easier reuse and testing of the developed software
products due to the TDD programming practice.[^40] Madeyski also
measured the effect of the TDD practice on unit tests using branch
coverage (BC) and mutation score indicator (MSI),[^41][^42][^43] which
are indicators of the thoroughness and the fault detection effectiveness
of unit tests, respectively. The effect size of TDD on branch coverage
was medium in size and therefore is considered substantive effect.[^44]
These findings have been subsequently confirmed by further, smaller
experimental evaluations of TDD.[^45][^46][^47][^48]

### Psychological benefits to programmer {#psychological_benefits_to_programmer}

1.  **Increased Confidence**: TDD allows programmers to make changes or
    add new features with confidence. Knowing that the code is
    constantly tested reduces the fear of breaking existing
    functionality. This safety net can encourage more innovative and
    creative approaches to problem-solving.
2.  **Reduced Fear of Change, Reduced Stress**: In traditional
    development, changing existing code can be daunting due to the risk
    of introducing bugs. TDD, with its comprehensive test suite, reduces
    this fear, as tests will immediately reveal any problems caused by
    changes. Knowing that the codebase has a safety net of tests can
    reduce stress and anxiety associated with programming. Developers
    might feel more relaxed and open to experimenting and refactoring.
3.  **Improved Focus**: Writing tests first helps programmers
    concentrate on requirements and design before writing the code. This
    focus can lead to clearer, more purposeful coding, as the developer
    is always aware of the goal they are trying to achieve.
4.  **Sense of Achievement and Job Satisfaction**: Passing tests can
    provide a quick, regular sense of accomplishment, boosting morale.
    This can be particularly motivating in long-term projects where the
    end goal might seem distant. The combination of all these factors
    can lead to increased job satisfaction. When developers feel
    confident, focused, and part of a collaborative team, their overall
    job satisfaction can significantly improve.

### Limitations

\`\`\`{=mediawiki}
{{more citations needed section|date=August 2013}}
\`\`\`

Test-driven development does not perform sufficient testing in
situations where full functional tests are required to determine success
or failure, due to extensive use of unit tests.[^49] Examples of these
are [user interfaces](user_interface 'user interface'){.wikilink},
programs that work with [databases](database 'database'){.wikilink}, and
some that depend on specific
[network](Computer_network 'network'){.wikilink} configurations. TDD
encourages developers to put the minimum amount of code into such
modules and to maximize the logic that is in testable library code,
using fakes and [mocks](Mock_object 'mocks'){.wikilink} to represent the
outside world.[^50]

Management support is essential. Without the entire organization
believing that test-driven development is going to improve the product,
management may feel that time spent writing tests is wasted.[^51]

Unit tests created in a test-driven development environment are
typically created by the developer who is writing the code being tested.
Therefore, the tests may share blind spots with the code: if, for
example, a developer does not realize that certain input parameters must
be checked, most likely neither the test nor the code will verify those
parameters. Another example: if the developer misinterprets the
requirements for the module they are developing, the code and the unit
tests they write will both be wrong in the same way. Therefore, the
tests will pass, giving a false sense of correctness.

A high number of passing unit tests may bring a false sense of security,
resulting in fewer additional [software
testing](software_testing 'software testing'){.wikilink} activities,
such as [integration
testing](integration_testing 'integration testing'){.wikilink} and
[compliance
testing](compliance_testing 'compliance testing'){.wikilink}.

Tests become part of the maintenance overhead of a project. Badly
written tests, for example ones that include hard-coded error strings,
are themselves prone to failure, and they are expensive to maintain.
This is especially the case with [fragile
tests](fragile_tests 'fragile tests'){.wikilink}.[^52] There is a risk
that tests that regularly generate false failures will be ignored, so
that when a real failure occurs, it may not be detected. It is possible
to write tests for low and easy maintenance, for example by the reuse of
error strings, and this should be a goal during the [code
refactoring](code_refactoring 'code refactoring'){.wikilink} phase
described above.

Writing and maintaining an excessive number of tests costs time. Also,
more-flexible modules (with limited tests) might accept new requirements
without the need for changing the tests. For those reasons, testing for
only extreme conditions, or a small sample of data, can be easier to
adjust than a set of highly detailed tests.

The level of coverage and testing detail achieved during repeated TDD
cycles cannot easily be re-created at a later date. Therefore, these
original, or early, tests become increasingly precious as time goes by.
The tactic is to fix it early. Also, if a poor architecture, a poor
design, or a poor testing strategy leads to a late change that makes
dozens of existing tests fail, then it is important that they are
individually fixed. Merely deleting, disabling or rashly altering them
can lead to undetectable holes in the test coverage.

## Conference

First TDD Conference was held during July 2021.[^53] Conferences were
recorded on [YouTube](YouTube 'YouTube'){.wikilink}[^54]

## See also {#see_also}

\`\`\`{=mediawiki}
{{Columns-list|colwidth=22em|
* [[Acceptance testing]]
* [[Behavior-driven development]]
* [[Design by contract]]
* [[Inductive programming]]<!-- automatically producing a program from test cases -->
* [[Integration testing]]
* [[List of software development philosophies]]
* [[List of unit testing frameworks]]
* [[Mock object]]
* [[Programming by example]]<!-- example-driven program synthesis -->
* [[Sanity check]]
* [[Self-testing code]]
* [[Software testing]]
* [[Test case]]
* [[Transformation Priority Premise]]
* [[Unit testing]]
* [[Continuous test-driven development]]
}}
\`\`\`

## References

\`\`\`{=mediawiki}
{{reflist|30em}}
\`\`\`

## External links {#external_links}

- [TestDrivenDevelopment](c2:TestDrivenDevelopment 'TestDrivenDevelopment'){.wikilink}
  on WikiWikiWeb

- \`\`\`{=mediawiki}
  {{cite web
    |url=http://www.eiffel.com/general/monthly_column/2004/september.html
    |title=Test or spec? Test and spec? Test from spec!
    |author=Bertrand Meyer
    |date=September 2004
    |archive-url=https://web.archive.org/web/20050209222453/http://eiffel.com/general/monthly_column/2004/september.html
    |archive-date=2005-02-09
  }}
  \`\`\`

- \[<https://web.archive.org/web/20121021141635/http://msdn.microsoft.com/en-us/library/ms379625(VS.80>).aspx
  Microsoft Visual Studio Team Test from a TDD approach\]

- [Write Maintainable Unit Tests That Will Save You Time And
  Tears](http://msdn.microsoft.com/en-us/magazine/cc163665.aspx)

- [Improving Application Quality Using Test-Driven Development
  (TDD)](https://web.archive.org/web/20130124034916/http://www.methodsandtools.com/archive/archive.php?id=20)

- [Test Driven Development Conference](http://tddconf.com/)

\`\`\`{=mediawiki}
{{DEFAULTSORT:Test-Driven Development}}
\`\`\`

[Category:Extreme
programming](Category:Extreme_programming 'Category:Extreme programming'){.wikilink}
[Category:Software development
philosophies](Category:Software_development_philosophies 'Category:Software development philosophies'){.wikilink}
[Category:Software development
process](Category:Software_development_process 'Category:Software development process'){.wikilink}
[Category:Software
testing](Category:Software_testing 'Category:Software testing'){.wikilink}

[^1]:
    \`\`\`{=mediawiki}
    {{Cite journal |last1=Parsa |first1=Saeed |last2=Zakeri-Nasrabadi |first2=Morteza |last3=Turhan |first3=Burak |date=2025-01-01 |title=Testability-driven development: An improvement to the TDD efficiency |url=https://www.sciencedirect.com/science/article/pii/S0920548924000461 |journal=Computer Standards & Interfaces |volume=91 |pages=103877 |doi=10.1016/j.csi.2024.103877 |issn=0920-5489}}
    \`\`\`

[^2]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.computerworld.com/softwaretopics/software/appdev/story/0,10801,66192,00.html |title=Extreme Programming |author=Lee Copeland |date=December 2001 |publisher=Computerworld |access-date=January 11, 2011 |archive-url=https://web.archive.org/web/20110605060209/http://www.computerworld.com/s/article/66192/Extreme_Programming?taxonomyId=063 |archive-date=June 5, 2011 |url-status=dead }}
    \`\`\`

[^3]:
    Newkirk, JW and Vorontsov, AA. _Test-Driven Development in
    Microsoft .NET_, Microsoft Press, 2004.

[^4]:
    Feathers, M. Working Effectively with Legacy Code, Prentice Hall,
    2004

[^5]:
    \`\`\`{=mediawiki}
    {{cite web|url=http://www.quora.com/Why-does-Kent-Beck-refer-to-the-rediscovery-of-test-driven-development |title=Why does Kent Beck refer to the "rediscovery" of test-driven development? |author=Kent Beck | date=May 11, 2012 |access-date=December 1, 2014}}
    \`\`\`

[^6]:

[^7]:
    \`\`\`{=mediawiki}
    {{cite book |last=Beck| first=Kent |title=Test-Driven Development by Example |publisher=Addison Wesley |location=Vaseem |date=2002-11-08 |isbn=978-0-321-14653-3}}
    \`\`\`

[^8]:
    \`\`\`{=mediawiki}
    {{Cite web |last=Beck |first=Kent |date=2023-12-11 |title=Canon TDD |url=https://tidyfirst.substack.com/p/canon-tdd |access-date=2024-10-22 |website=Software Design: Tidy First?}}
    \`\`\`

[^9]:

[^10]:
    Leybourn, E. (2013) _Directing the Agile Organisation: A Lean
    Approach to Business Management_. London: IT Governance Publishing:
    176-179.

[^11]:
    \`\`\`{=mediawiki}
    {{Cite web |last=Mohan |first=Gayathri |title=Full Stack Testing |url=https://www.thoughtworks.com/en-us/insights/books/full-stack-testing |access-date=2022-09-07 |website=www.thoughtworks.com |language=en-US}}
    \`\`\`

[^12]:

[^13]:
    \`\`\`{=mediawiki}
    {{cite web|title=Effective TDD for Complex Embedded Systems Whitepaper|url=http://www.pathfindersolns.com/wp-content/uploads/2012/05/Effective-TDD-Executive-Summary.pdf|archive-url=https://web.archive.org/web/20160316153308/http://www.pathfindersolns.com/wp-content/uploads/2012/05/Effective-TDD-Executive-Summary.pdf|url-status=dead|archive-date=2016-03-16|publisher=Pathfinder Solutions}}
    \`\`\`

[^14]:
    \`\`\`{=mediawiki}
    {{cite web |url=http://www.agilesherpa.org/agile_coach/engineering_practices/test_driven_development/ |title=Agile Test Driven Development |publisher=Agile Sherpa |date=2010-08-03 |access-date=2012-08-14 |archive-url=https://archive.today/20120723184333/http://www.agilesherpa.org/agile_coach/engineering_practices/test_driven_development/ |archive-date=2012-07-23 |url-status=dead }}
    \`\`\`

[^15]:
    \`\`\`{=mediawiki}
    {{cite web
    |title=Subverting Java Access Protection for Unit Testing
    |url=http://www.onjava.com/pub/a/onjava/2003/11/12/reflection.html
    |last=Burton
    |first=Ross
    |date=2003-11-12
    |publisher=O'Reilly Media, Inc.
    |access-date=2009-08-12
    }}
    \`\`\`

[^16]:
    \`\`\`{=mediawiki}
    {{cite web | url=https://www.python.org/dev/peps/pep-0008/ |title=PEP 8 -- Style Guide for Python Code |last1=van Rossum |first1=Guido |last2=Warsaw |first2=Barry |date=5 July 2001 |publisher=Python Software Foundation |access-date=6 May 2012}}
    \`\`\`

[^17]:
    \`\`\`{=mediawiki}
    {{cite web
    |url=http://blogs.msdn.com/jamesnewkirk/archive/2004/06/07/150361.aspx
    |title=Testing Private Methods/Member Variables - Should you or shouldn't you
    |last=Newkirk
    |first=James
    |date=7 June 2004
    |publisher=Microsoft Corporation
    |access-date=2009-08-12}}
    \`\`\`

[^18]:
    \`\`\`{=mediawiki}
    {{cite web
    |url=http://www.codeproject.com/KB/cs/testnonpublicmembers.aspx
    |title=How to Test Private and Protected methods in .NET
    |last=Stall
    |first=Tim
    |date=1 Mar 2005
    |publisher=CodeProject
    |access-date=2009-08-12}}
    \`\`\`

[^19]:
    \`\`\`{=mediawiki}
    {{cite book |title=Refactoring - Improving the design of existing code |last=Fowler |first=Martin |year=1999 |publisher=Addison Wesley Longman, Inc. |location=Boston |isbn=0-201-48567-2 |url=https://archive.org/details/isbn_9780201485677 }}
    \`\`\`

[^20]:

[^21]:

[^22]:
    Koskela, L. \"Test Driven: TDD and Acceptance TDD for Java
    Developers\", Manning Publications, 2007

[^23]:

[^24]:

[^25]:
    \`\`\`{=mediawiki}
    {{YouTube| id=0BWSms3J40Y| title=Test-Driven Development (TDD) for Complex Systems Introduction}}
    \`\`\`

    by Pathfinder Solutions

[^26]:
    \`\`\`{=mediawiki}
    {{cite book |title=Lean-Agile Acceptance Test-Driven Development: Better Software Through Collaboration  |year=2011 |publisher=Addison Wesley Professional |location=Boston |isbn=978-0321714084}}
    \`\`\`

[^27]:
    \`\`\`{=mediawiki}
    {{cite web
    |title=BDD
    |url=http://guide.agilealliance.org/guide/bdd.html
    |access-date=2015-04-28
    |archive-date=2015-05-08
    |archive-url=https://web.archive.org/web/20150508045550/http://guide.agilealliance.org/guide/bdd.html
    |url-status=dead
    }}
    \`\`\`

[^28]:
    \`\`\`{=mediawiki}
    {{cite web|title=Effective TDD for Complex, Embedded Systems Whitepaper|url=http://www.pathfindersolns.com/download-whitepaper/?download=EffectiveTDDforComplexEmbeddedSystems.pdf&title=Effective_TDD_for_Complex_Embedded_Systems|publisher=Pathfinder Solutions|access-date=2012-11-27|archive-url=https://web.archive.org/web/20130820134917/http://www.pathfindersolns.com/download-whitepaper?download=EffectiveTDDforComplexEmbeddedSystems.pdf&title=Effective_TDD_for_Complex_Embedded_Systems|archive-date=2013-08-20|url-status=dead}}
    \`\`\`

[^29]:

[^30]:

[^31]:

[^32]:
    [Advantages and Disadvantages of Test Driven Development -
    LASOFT](https://lasoft.org/blog/test-driven-development-tdd/)

[^33]:
    \`\`\`{=mediawiki}
    {{Cite journal |last1=Parsa |first1=Saeed |last2=Zakeri-Nasrabadi |first2=Morteza |last3=Turhan |first3=Burak |date=2025-01-01 |title=Testability-driven development: An improvement to the TDD efficiency |url=https://www.sciencedirect.com/science/article/pii/S0920548924000461 |journal=Computer Standards & Interfaces |volume=91 |pages=103877 |doi=10.1016/j.csi.2024.103877 |issn=0920-5489}}
    \`\`\`

[^34]:
    \`\`\`{=mediawiki}
    {{cite web
     | url = http://nparc.cisti-icist.nrc-cnrc.gc.ca/npsi/ctrl?action=shwart&index=an&req=5763742&lang=en
     | title = On the Effectiveness of Test-first Approach to Programming
     | access-date = 2008-01-14
     | last = Erdogmus
     | first = Hakan
     | author2 = Morisio, Torchiano
     | publisher = Proceedings of the IEEE Transactions on Software Engineering, 31(1). January 2005. (NRC 47445)
     | quote = We found that test-first students on average wrote more tests and, in turn, students who wrote more tests tended to be more productive.
     | archive-url = https://web.archive.org/web/20141222180731/http://nparc.cisti-icist.nrc-cnrc.gc.ca/npsi/ctrl?action=shwart&index=an&req=5763742&lang=en
     | archive-date = 2014-12-22
     | url-status = dead
     }}
    \`\`\`

[^35]:
    \`\`\`{=mediawiki}
    {{cite web
     | url = http://theruntime.com/blogs/jacob/archive/2008/01/22/tdd-proven-effective-or-is-it.aspx
     | title = TDD Proven Effective! Or is it?
     | access-date = 2008-02-21
     | last = Proffitt
     | first = Jacob
     | quote = So TDD's relationship to quality is problematic at best. Its relationship to productivity is more interesting. I hope there's a follow-up study because the productivity numbers simply don't add up very well to me. There is an undeniable correlation between productivity and the number of tests, but that correlation is actually stronger in the non-TDD group (which had a single [[outlier]] compared to roughly half of the TDD group being outside the 95% band).
     | archive-url = https://web.archive.org/web/20080206103552/http://theruntime.com/blogs/jacob/archive/2008/01/22/tdd-proven-effective-or-is-it.aspx
     | archive-date = 2008-02-06
     | url-status = dead
     }}
    \`\`\`

[^36]:
    \`\`\`{=mediawiki}
    {{cite web
     | url = http://gamesfromwithin.com/stepping-through-the-looking-glass-test-driven-game-development-part-1
     | title = Stepping Through the Looking Glass: Test-Driven Game Development (Part 1)
     | access-date = 2007-11-01
     | last = Llopis
     | first = Noel
     | date = 20 February 2005
     | publisher = Games from Within
     | quote = Comparing [TDD] to the non-test-driven development approach, you're replacing all the mental checking and debugger stepping with code that verifies that your program does exactly what you intended it to do.
    }}
    \`\`\`

[^37]:
    \`\`\`{=mediawiki}
    {{cite book|last1=Mayr|first1=Herwig|title=Projekt Engineering Ingenieurmässige Softwareentwicklung in Projektgruppen|date=2005|publisher=Fachbuchverl. Leipzig im Carl-Hanser-Verl.|location=München|isbn=978-3446400702|page=239|edition=2., neu bearb. Aufl.}}
    \`\`\`

[^38]:
    \`\`\`{=mediawiki}
    {{cite web
     | url = https://pdfs.semanticscholar.org/65d9/24ef1162b2f3c24bd15d627302887991b298.pdf
     | archive-url = https://web.archive.org/web/20171108092303/https://pdfs.semanticscholar.org/65d9/24ef1162b2f3c24bd15d627302887991b298.pdf
     | url-status = dead
     | archive-date = 2017-11-08
     | title = About the Return on Investment of Test-Driven Development
     | access-date = 2012-06-14
     | last = Müller
     | first = Matthias M.
     |author2=Padberg, Frank
      | publisher = Universität Karlsruhe, Germany
     | page = 6
    | s2cid = 13905442
     }}
    \`\`\`

[^39]:
    Madeyski, L. \"Test-Driven Development - An Empirical Evaluation
    of Agile Practice\", Springer, 2010,
    \`{{ISBN|978-3-642-04287-4}}\`{=mediawiki}, pp. 1-245. DOI:
    978-3-642-04288-1

[^40]:

[^41]:
    [The impact of Test-First programming on branch coverage and
    mutation score indicator of unit tests: An
    experiment.](http://madeyski.e-informatyka.pl/download/Madeyski10c.pdf)
    by L. Madeyski _Information & Software Technology 52(2): 169-184
    (2010)_

[^42]:
    [On the Effects of Pair Programming on Thoroughness and
    Fault-Finding Effectiveness of Unit
    Tests](http://madeyski.e-informatyka.pl/download/Madeyski07.pdf) by
    L. Madeyski _PROFES 2007: 207-221_

[^43]:
    [Impact of pair programming on thoroughness and fault detection
    effectiveness of unit test
    suites.](http://madeyski.e-informatyka.pl/download/Madeyski08.pdf)
    by L. Madeyski _Software Process: Improvement and Practice 13(3):
    281-295 (2008)_

[^44]:

[^45]:
    M. Pančur and M. Ciglarič, \"Impact of test-driven development on
    productivity, code and tests: A controlled experiment\", Information
    and Software Technology, 2011, vol. 53, no. 6, pp. 557--573, DOI:
    10.1016/j.infsof.2011.02.002

[^46]:
    D. Fucci, H. Erdogmus, B. Turhan, M. Oivo, and N. Juristo, \"A
    dissection of the test-driven development process: does it really
    matter to test-first or to test-last?\", IEEE Transactions on
    Software Engineering, 2017, vol. 43, no. 7, pp. 597--614, DOI:
    10.1109/TSE.2016.2616877

[^47]:
    A. Tosun, O. Dieste Tubio, D. Fucci, S. Vegas, B. Turhan, H.
    Erdogmus, A. Santos, M. Oivo, K. Toro, J. Jarvinen, and N. Juristo,
    \"An industry experiment on the effects of test-driven development
    on external quality and productivity\", Empirical Software
    Engineering, 2016, vol. 22, pp. 1--43, DOI:
    10.1007/s10664-016-9490-0

[^48]:
    B. Papis, K. Grochowski, K. Subzda and K. Sijko, [\"Experimental
    evaluation of test-driven development with interns working on a real
    industrial project\"](https://ieeexplore.ieee.org/document/9207972),
    IEEE Transactions on Software Engineering, 2020, DOI:
    10.1109/TSE.2020.3027522

[^49]:
    \`\`\`{=mediawiki}
    {{cite web
     | url=http://dalkescientific.com/writings/diary/archive/2009/12/29/problems_with_tdd.html
     | title=Problems with TDD
     | publisher=Dalkescientific.com
     | date=2009-12-29
     | access-date=2014-03-25}}
    \`\`\`

[^50]:
    \`\`\`{=mediawiki}
    {{cite web
     | last=Hunter
     | first=Andrew
     | url=https://www.simple-talk.com/dotnet/.net-framework/are-unit-tests-overused/
     | title=Are Unit Tests Overused?
     | work=Simple Talk
     | publisher=Simple-talk.com
     | date=2012-10-19 |access-date=2014-03-25}}
    \`\`\`

[^51]:
    \`\`\`{=mediawiki}
    {{cite web
     | url=http://people.apache.org/~stevel/slides/testing.pdf
     | title=Testing
     | last=Loughran
     | first=Steve
     | date=November 6, 2006
     | publisher=HP Laboratories
     | access-date=2009-08-12
     }}
    \`\`\`

[^52]:
    \`\`\`{=mediawiki}
    {{cite web
     | url=http://xunitpatterns.com/Fragile%20Test.html
     | title=Fragile Tests
    }}
    \`\`\`

[^53]:
    \`\`\`{=mediawiki}
    {{cite web|last=Bunardzic|first=Alex|title=First International Test Driven Development (TDD) Conference|url=https://tddconference.github.io/|access-date=2021-07-20|website=TDD Conference|language=en}}
    \`\`\`

[^54]:
    \`\`\`{=mediawiki}
    {{Citation|title=First International TDD Conference - Saturday July 10, 2021| date=10 July 2021 |url=https://www.youtube.com/watch?v=-_noEVCR__I |archive-url=https://ghostarchive.org/varchive/youtube/20211221/-_noEVCR__I |archive-date=2021-12-21 |url-status=live|language=en|access-date=2021-07-20}}
    \`\`\`

    \`\`\`{=mediawiki}
    {{cbignore}}
    \`\`\`
`,
  },
];
