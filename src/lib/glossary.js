// lib/glossary.js
// -----------------------------------------------------------------------------
// What the jargon in a JD actually means, and — the part that matters — how to
// screen for it without being an engineer.
//
// A recruiter who doesn't know what Kafka is cannot tell a candidate who has
// run it in production from one who listed it after a weekend tutorial. Every
// entry therefore carries `screen`: concrete things to look for or ask, phrased
// so they can be used verbatim on a call.
//
// Curated rather than generated, so it is instant, free, needs no key, and says
// the same thing twice. lib/termInsight.js falls back to the LLM for terms that
// aren't in here.
// -----------------------------------------------------------------------------

/* kind: technology | platform | method | metric | credential | concept
   `where` answers "why does a company pay for this?", which is what makes a
   recruiter sound informed on a first call. */
export const GLOSSARY = [
  // --- data & backend ---------------------------------------------------------
  { id: "kafka", label: "Apache Kafka", aliases: ["kafka", "apache kafka", "confluent"], family: "engineering", kind: "technology",
    what: "A system for moving huge streams of events between applications — think of it as a durable, replayable pipe rather than a database.",
    where: "Anywhere events pile up faster than one system can handle them: payments, order flows, ride matching, fraud checks, clickstream analytics. Common at fintechs, marketplaces and anything real-time.",
    screen: ["Ask what the throughput was — events per second or per day. A real operator knows their numbers; a tutorial user doesn't.", "Ask about partitions and consumer lag. Anyone who has run Kafka in production has fought consumer lag.", "\"Did you set it up, or use one somebody else ran?\" Using a managed Kafka is much shallower than operating a cluster."],
    related: ["rabbitmq", "spark", "microservices"] },

  { id: "rabbitmq", label: "RabbitMQ", aliases: ["rabbitmq", "rabbit mq"], family: "engineering", kind: "technology",
    what: "A message broker that passes jobs between services. Older and simpler than Kafka, and used for task queues rather than event streams.",
    where: "Background jobs — sending email, generating invoices, processing uploads.",
    screen: ["Kafka and RabbitMQ solve different problems; a candidate who treats them as interchangeable hasn't used either deeply."],
    related: ["kafka"] },

  { id: "kubernetes", label: "Kubernetes (K8s)", aliases: ["kubernetes", "k8s", "eks", "aks", "gke"], family: "engineering", kind: "platform",
    what: "Software that runs and restarts applications across a fleet of machines, so a service survives a machine dying and can scale on demand.",
    where: "Almost any company running more than a handful of services. Ubiquitous in product companies; often managed for them as EKS, AKS or GKE.",
    screen: ["\"Did you use a cluster or run one?\" Deploying onto someone else's cluster is a far smaller skill than operating it.", "Ask about a time a deploy went wrong and what they did — real operators have war stories about rollouts and resource limits."],
    related: ["docker", "terraform", "sre"] },

  { id: "docker", label: "Docker / containers", aliases: ["docker", "container", "containers", "containerisation", "containerization"], family: "engineering", kind: "technology",
    what: "A way to package an application with everything it needs so it runs identically on a laptop and in production.",
    where: "Effectively table stakes for backend work now. Its presence says little; its absence on a modern backend CV is worth asking about.",
    screen: ["Treat this as a baseline, not a differentiator — nearly every backend engineer has it."],
    related: ["kubernetes"] },

  { id: "terraform", label: "Terraform / IaC", aliases: ["terraform", "infrastructure as code", "iac", "pulumi", "cloudformation"], family: "engineering", kind: "technology",
    what: "Describing servers and cloud resources as code, so infrastructure is version-controlled and reproducible instead of clicked together by hand.",
    where: "Platform and DevOps teams. A strong signal of engineering maturity at the company they came from.",
    screen: ["Ask how they handled state files and environments — the honest answer involves pain."],
    related: ["kubernetes", "sre"] },

  { id: "sre", label: "SRE / reliability", aliases: ["sre", "site reliability", "reliability engineering", "slo", "sla", "error budget", "on-call", "oncall"], family: "engineering", kind: "concept",
    what: "Keeping systems up, measured with explicit targets: SLOs (the goal), SLAs (the promise to customers) and error budgets (how much failure is acceptable).",
    where: "Companies large enough that downtime costs real money.",
    screen: ["Ask for their SLO and whether they met it. Numbers separate practitioners from people who attended the meetings.", "Ask about the worst incident they handled and what changed afterwards."],
    related: ["kubernetes", "observability"] },

  { id: "observability", label: "Observability", aliases: ["observability", "prometheus", "grafana", "datadog", "opentelemetry", "new relic"], family: "engineering", kind: "concept",
    what: "Being able to tell what a live system is doing from its metrics, logs and traces — so failures can be diagnosed without guesswork.",
    where: "Any team on call for their own service.",
    screen: ["\"How did you know something was broken before a customer told you?\" The answer reveals whether monitoring was real."],
    related: ["sre"] },

  { id: "microservices", label: "Microservices", aliases: ["microservices", "microservice", "service oriented", "soa", "monolith"], family: "engineering", kind: "concept",
    what: "Splitting an application into many small independent services rather than one large program (a monolith).",
    where: "Larger engineering orgs. Worth knowing that the industry has cooled on it — moving back to a monolith is now a respectable answer, not a red flag.",
    screen: ["Ask how many services and how big the team was. Fifty services and six engineers is a warning sign they will recognise."],
    related: ["kafka", "kubernetes"] },

  { id: "spark", label: "Apache Spark", aliases: ["spark", "pyspark", "databricks"], family: "engineering", kind: "technology",
    what: "An engine for processing data far too large for one machine, spread across a cluster.",
    where: "Data engineering and analytics — nightly pipelines, large joins, ML feature preparation.",
    screen: ["Ask the data volume they worked with. \"Big data\" on a CV often turns out to be a spreadsheet."],
    related: ["airflow", "snowflake"] },

  { id: "airflow", label: "Airflow / orchestration", aliases: ["airflow", "dagster", "prefect", "orchestration", "dag", "dags"], family: "engineering", kind: "technology",
    what: "A scheduler that runs data pipelines in the right order and retries the parts that fail.",
    where: "Any team with nightly reporting or ML pipelines.",
    screen: ["Ask what broke most often and how they handled backfills — the everyday reality of the job."],
    related: ["spark", "dbt"] },

  { id: "dbt", label: "dbt", aliases: ["dbt", "data build tool"], family: "engineering", kind: "technology",
    what: "A tool for transforming data inside a warehouse using SQL, with testing and version control around it.",
    where: "Modern analytics teams; usually alongside Snowflake or BigQuery.",
    screen: ["Signals an analytics engineer rather than a classic data engineer — worth checking which role you're actually filling."],
    related: ["snowflake", "airflow"] },

  { id: "snowflake", label: "Snowflake / warehouses", aliases: ["snowflake", "bigquery", "redshift", "data warehouse", "databricks"], family: "engineering", kind: "platform",
    what: "A database built for analytics — storing years of company data so it can be queried quickly.",
    where: "Anywhere with a BI or analytics function.",
    screen: ["Ask about cost control. Warehouse bills are a real operational skill and a common interview topic."],
    related: ["dbt", "spark"] },

  { id: "redis", label: "Redis", aliases: ["redis", "memcached", "caching", "cache"], family: "engineering", kind: "technology",
    what: "An in-memory store used to keep frequently-needed data instantly available, taking load off the main database.",
    where: "Nearly every high-traffic web application.",
    screen: ["Ask what they cached and how they handled stale data — cache invalidation is the classic hard problem."],
    related: ["postgres"] },

  { id: "postgres", label: "PostgreSQL / SQL", aliases: ["postgres", "postgresql", "mysql", "sql", "rdbms", "oracle db"], family: "engineering", kind: "technology",
    what: "The relational database most products are built on, queried with SQL.",
    where: "Universal. SQL competence is a fair baseline filter for backend, data and analytics roles alike.",
    screen: ["Ask about the slowest query they fixed. Indexing and query plans separate depth from familiarity."],
    related: ["redis", "snowflake"] },

  { id: "elasticsearch", label: "Elasticsearch / OpenSearch", aliases: ["elasticsearch", "elastic search", "opensearch", "solr", "lucene"], family: "engineering", kind: "technology",
    what: "A search engine for text — what powers a site's search box and a lot of log analysis.",
    where: "E-commerce, marketplaces, log platforms.",
    screen: ["Ask whether they tuned relevance or just indexed documents; the first is much rarer."],
    related: ["observability"] },

  { id: "graphql", label: "GraphQL", aliases: ["graphql", "apollo"], family: "engineering", kind: "technology",
    what: "A way for apps to ask an API for exactly the data they need in one request, instead of calling several REST endpoints.",
    where: "Product teams with mobile apps or complex front-ends.",
    screen: ["Ask about the N+1 problem — anyone who has run GraphQL at scale has hit it."],
    related: ["rest", "react"] },

  { id: "rest", label: "REST API", aliases: ["rest", "rest api", "restful", "api integration", "openapi", "swagger"], family: "engineering", kind: "concept",
    what: "The standard style for letting two systems talk over the web.",
    where: "Everywhere. Like Docker, near-universal — its presence on a CV is not a differentiator.",
    screen: ["Baseline, not a signal. Probe what they built with it instead."],
    related: ["graphql", "microservices"] },

  { id: "grpc", label: "gRPC", aliases: ["grpc", "protobuf", "protocol buffers"], family: "engineering", kind: "technology",
    what: "A faster, stricter way for services to call each other than REST, common between internal services.",
    where: "Performance-sensitive microservice estates.",
    screen: ["Usually appears alongside Go or Java microservices; a useful hint about the architecture they came from."],
    related: ["microservices"] },

  // --- languages & frameworks -------------------------------------------------
  { id: "react", label: "React", aliases: ["react", "reactjs", "react.js", "next.js", "nextjs"], family: "engineering", kind: "technology",
    what: "The dominant library for building web interfaces.",
    where: "Most product front-ends. Next.js is the framework built on top of it.",
    screen: ["Ask about state management and performance work — anyone can render a list; few can fix a slow one."],
    related: ["graphql", "typescript"] },

  { id: "typescript", label: "TypeScript", aliases: ["typescript", "ts"], family: "engineering", kind: "technology",
    what: "JavaScript with type checking, which catches a class of bugs before the code runs.",
    where: "Standard on serious front-end and Node teams now.",
    screen: ["A JavaScript-only CV in 2026 is worth a question about why."],
    related: ["react", "node"] },

  { id: "node", label: "Node.js", aliases: ["node", "nodejs", "node.js", "express", "nestjs"], family: "engineering", kind: "technology",
    what: "JavaScript running on the server, so one language covers both front and back end.",
    where: "Startups and product teams valuing speed; APIs and real-time services.",
    screen: ["Ask how they handled blocking work — the classic Node trap."],
    related: ["typescript", "react"] },

  { id: "golang", label: "Go (Golang)", aliases: ["go", "golang"], ambiguous: ["go"], family: "engineering", kind: "technology",
    what: "A language built for fast, concurrent network services. Simple by design.",
    where: "Infrastructure, platform teams, high-throughput APIs. Common at fintech and infra companies.",
    screen: ["Ask about goroutines and channels. Also note Go engineers often come from Python or Java — recency matters more than years."],
    related: ["kubernetes", "grpc"] },

  { id: "java", label: "Java / Spring Boot", aliases: ["java", "spring", "spring boot", "j2ee", "jvm", "hibernate"], family: "engineering", kind: "technology",
    what: "The long-standing enterprise backend language; Spring Boot is the framework almost all modern Java services use.",
    where: "Banks, insurers, large enterprises and Indian IT services — the deepest talent pool in the country.",
    screen: ["Distinguish Spring Boot (modern) from J2EE or struts (legacy); they imply very different engineering cultures."],
    related: ["microservices", "kafka"] },

  { id: "dotnet", label: ".NET / C#", aliases: [".net", "dotnet", "c#", "csharp", "asp.net"], family: "development", kind: "technology",
    what: "Microsoft's application platform and its main language.",
    where: "Enterprises, product companies with a Microsoft stack, a large share of Indian services work.",
    screen: ["Ask .NET Framework or .NET Core/5+ — the older one is a meaningfully different, and shrinking, skill set."],
    related: ["azure", "java"] },

  { id: "python", label: "Python", aliases: ["python", "django", "flask", "fastapi", "pandas"], family: "engineering", kind: "technology",
    what: "A general-purpose language dominant in data, ML and scripting, and common for web backends.",
    where: "Data teams, ML, automation, startups.",
    screen: ["Python means very different things in a data role versus a backend role — check which one the CV is actually about."],
    related: ["spark", "ml"] },

  { id: "rust", label: "Rust", aliases: ["rust", "rustlang"], family: "engineering", kind: "technology",
    what: "A systems language offering speed with memory safety.",
    where: "Infrastructure, crypto, embedded, performance-critical components. Still a small talent pool in India.",
    screen: ["A small pool means slower hiring — set that expectation with the hiring manager early."],
    related: ["golang"] },

  // --- cloud ------------------------------------------------------------------
  { id: "aws", label: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3", "lambda"], family: "engineering", kind: "platform",
    what: "Amazon's cloud — the market leader for renting servers, storage and managed services.",
    where: "The default for most startups and many enterprises.",
    screen: ["Ask which services specifically. \"AWS\" spans a hundred products; S3 and EC2 alone is a shallow footprint.", "Certifications show study, not experience — ask what they actually built."],
    related: ["kubernetes", "terraform"] },

  { id: "azure", label: "Microsoft Azure", aliases: ["azure", "microsoft azure"], family: "engineering", kind: "platform",
    what: "Microsoft's cloud.",
    where: "Enterprises already committed to Microsoft, and much of Indian IT services.",
    screen: ["Usually pairs with .NET; an Azure + Java combination is worth a question."],
    related: ["dotnet", "aws"] },

  { id: "gcp", label: "Google Cloud (GCP)", aliases: ["gcp", "google cloud"], family: "engineering", kind: "platform",
    what: "Google's cloud, strongest in data and ML services.",
    where: "Data-heavy companies and ML teams.",
    screen: ["BigQuery experience is the most transferable part of a GCP CV."],
    related: ["snowflake", "aws"] },

  // --- ML / AI ----------------------------------------------------------------
  { id: "ml", label: "Machine learning", aliases: ["machine learning", "ml", "deep learning", "pytorch", "tensorflow", "scikit"], family: "engineering", kind: "concept",
    what: "Building systems that learn patterns from data rather than following written rules.",
    where: "Recommendations, fraud, pricing, forecasting, search ranking.",
    screen: ["Ask whether a model of theirs reached production and what it improved. Most ML CVs are notebooks that never shipped.", "Separate research (papers, experiments) from engineering (serving, monitoring) — very different hires."],
    related: ["llm", "python"] },

  { id: "llm", label: "LLMs / GenAI / RAG", aliases: ["llm", "llms", "genai", "generative ai", "rag", "langchain", "prompt engineering", "fine-tuning", "openai", "vector database"], family: "engineering", kind: "concept",
    what: "Building on large language models — including RAG, which feeds a model your own documents so it can answer from them.",
    where: "Support automation, internal search, copilots, document processing. Very hot, and CVs inflate fast here.",
    screen: ["Ask about evaluation: how did they know the output was good? Teams without an answer are usually demoing, not shipping.", "Ask about cost and latency per request — production users always know these.", "Two years of genuine LLM experience is the realistic ceiling; more than that on a CV needs explaining."],
    related: ["ml", "python"] },

  // --- sales ------------------------------------------------------------------
  { id: "quota", label: "Quota / attainment", aliases: ["quota", "attainment", "quota carrying", "target achievement", "% of target"], family: "sales", kind: "metric",
    what: "The revenue target a seller must hit, and attainment is the percentage they actually delivered against it.",
    where: "Every closing sales role. The single most important number on a sales CV.",
    screen: ["Always ask for quota size AND attainment — 90% of a ₹5 crore quota beats 130% of a ₹50 lakh one.", "Ask what proportion of the team hit quota. 120% looks different when everyone hit it.", "Ask for the split between new business and renewals."],
    related: ["arr", "pipeline"] },

  { id: "arr", label: "ARR / MRR", aliases: ["arr", "mrr", "annual recurring revenue", "monthly recurring revenue", "recurring revenue"], family: "sales", kind: "metric",
    what: "Annual (or monthly) recurring revenue — the predictable subscription income a SaaS business runs on.",
    where: "Every SaaS company. Deal sizes and seniority are usually described in ARR.",
    screen: ["Ask the average deal size in ARR. Someone selling ₹5 lakh deals sells very differently from someone selling ₹5 crore ones."],
    related: ["quota", "nrr"] },

  { id: "nrr", label: "NRR / churn", aliases: ["nrr", "ndr", "net revenue retention", "churn", "retention", "upsell", "cross-sell"], family: "sales", kind: "metric",
    what: "How much revenue from existing customers grows or shrinks. Above 100% means expansions outweigh cancellations.",
    where: "Customer success and account management; a core board-level SaaS metric.",
    screen: ["For an AM or CS hire this matters more than new-logo numbers — ask for their book's NRR."],
    related: ["arr", "quota"] },

  { id: "pipeline", label: "Pipeline / funnel", aliases: ["pipeline", "funnel", "pipeline generation", "sqls", "mqls", "top of funnel"], ambiguous: ["pipeline", "funnel"], family: "sales", kind: "concept",
    what: "The set of live deals at each stage, from first conversation to signature. Pipeline generation is creating new ones.",
    where: "All sales orgs; a leading indicator of future revenue.",
    screen: ["Ask how much pipeline they generated themselves versus received from marketing — a crucial difference for a hunter role."],
    related: ["quota", "meddic"] },

  { id: "meddic", label: "MEDDIC / MEDDPICC", aliases: ["meddic", "meddpicc", "medpicc"], family: "sales", kind: "method",
    what: "A qualification checklist for enterprise deals: Metrics, Economic buyer, Decision criteria, Decision process, Identify pain, Champion.",
    where: "Enterprise B2B sales with long cycles and many stakeholders.",
    screen: ["Ask them to walk a real deal through it. Anyone can name the letters; using it shows in how they describe the economic buyer and champion."],
    related: ["bant", "pipeline"] },

  { id: "bant", label: "BANT", aliases: ["bant"], family: "sales", kind: "method",
    what: "An older, lighter qualification framework: Budget, Authority, Need, Timeline.",
    where: "SMB and mid-market, and most SDR teams.",
    screen: ["BANT rather than MEDDIC usually signals smaller, faster deals — check that against your deal size."],
    related: ["meddic"] },

  { id: "sdr", label: "SDR / BDR", aliases: ["sdr", "bdr", "sales development", "business development representative", "inside sales", "cold calling", "outbound"], family: "sales", kind: "concept",
    what: "The prospecting role — booking qualified meetings for closers rather than closing deals.",
    where: "SaaS and B2B sales teams with a split model.",
    screen: ["Ask meetings booked per month and how many became opportunities.", "An SDR moving to a closing role is a real step up, not a lateral move — probe whether they've closed anything."],
    related: ["pipeline", "quota"] },

  { id: "salesforce", label: "Salesforce / CRM", aliases: ["salesforce", "sfdc", "crm", "hubspot", "zoho crm", "dynamics 365"], family: "sales", kind: "platform",
    what: "The system of record for customers and deals.",
    where: "Nearly every sales org. Note that Salesforce also appears as an ENGINEERING skill — admins and developers are a separate market.",
    screen: ["Check which sense the CV means. A Salesforce developer and a seller who uses Salesforce share nothing but the word."],
    related: ["pipeline"] },

  { id: "presidents-club", label: "President's Club", aliases: ["president's club", "presidents club", "presidents' club", "winners circle"], family: "sales", kind: "credential",
    what: "The annual award for top performers — typically the top 10-20% of a sales team.",
    where: "Most large sales organisations.",
    screen: ["Ask which years and the team size. Repeat winners are a genuinely strong signal; a single win in a small team is weaker."],
    related: ["quota"] },

  { id: "tam", label: "TAM / segment", aliases: ["tam", "sam", "som", "total addressable market", "enterprise", "mid-market", "smb"], family: "sales", kind: "concept",
    what: "The size of the market, and the customer bands sellers are organised into: SMB, mid-market, enterprise, strategic.",
    where: "Sales planning and territory design.",
    screen: ["Segment is the highest-signal thing on a sales CV after quota. Enterprise and SMB sellers rarely transplant well in either direction."],
    related: ["quota", "arr"] },

  // --- HR ---------------------------------------------------------------------
  { id: "hrbp", label: "HRBP", aliases: ["hrbp", "hr business partner", "people partner"], family: "hr", kind: "concept",
    what: "An HR generalist embedded with a business unit, advising its leaders on people matters rather than working in a central function.",
    where: "Mid-size and large companies.",
    screen: ["Ask the size and type of population supported — 200 engineers is a different job from 2,000 factory staff.", "Ask what they owned versus advised on."],
    related: ["ta", "attrition"] },

  { id: "ta", label: "Talent acquisition", aliases: ["talent acquisition", "ta", "recruitment", "recruiter", "sourcing", "campus hiring", "lateral hiring"], ambiguous: ["ta", "sourcing"], family: "hr", kind: "concept",
    what: "Recruiting, as a function — split between sourcing (finding people) and full-cycle (finding through to offer).",
    where: "Everywhere; specialisms split by tech/non-tech, campus/lateral, volume/leadership.",
    screen: ["Ask offers made and joined per quarter, and the roles. Volume BPO hiring and niche leadership search are different trades.", "Ask their offer-to-join ratio — in India this is the number that actually hurts."],
    related: ["ats", "hrbp"] },

  { id: "ats", label: "ATS", aliases: ["ats", "applicant tracking", "greenhouse", "lever", "workday recruiting", "naukri rms", "darwinbox", "successfactors"], family: "hr", kind: "platform",
    what: "Applicant tracking system — the database that holds candidates and pipelines.",
    where: "Any recruiting team above a handful of hires.",
    screen: ["Ask whether they administered it or just used it; ATS ownership and reporting is a distinct, more senior skill."],
    related: ["ta"] },

  { id: "attrition", label: "Attrition / retention", aliases: ["attrition", "retention", "turnover", "regretted attrition", "early attrition"], family: "hr", kind: "metric",
    what: "The rate at which employees leave. Regretted attrition counts only the ones you wanted to keep.",
    where: "A standing HR metric, especially in Indian IT services where it runs high.",
    screen: ["Ask what they did that moved the number, not just what the number was."],
    related: ["hrbp"] },

  { id: "posh", label: "POSH / statutory HR", aliases: ["posh", "prevention of sexual harassment", "pf", "esi", "gratuity", "shops and establishments", "labour law", "statutory compliance"], family: "hr", kind: "credential",
    what: "India's statutory employment obligations — POSH committees, Provident Fund, ESI, gratuity and state labour rules.",
    where: "Any India HR ops or compliance role.",
    screen: ["Ask whether they ran an inquiry or filed returns themselves, or supervised someone who did."],
    related: ["hrbp"] },

  // --- finance ----------------------------------------------------------------
  { id: "fpna", label: "FP&A", aliases: ["fp&a", "fpna", "fpa", "financial planning", "budgeting", "forecasting", "variance analysis"], family: "finance", kind: "concept",
    what: "Financial planning and analysis — budgets, forecasts, and explaining why actuals differed from plan.",
    where: "Every company past a certain size; a common route into strategic finance roles.",
    screen: ["Ask what they forecast and how far off they were. Owning a forecast is very different from assembling one."],
    related: ["controllership"] },

  { id: "controllership", label: "Controllership / close", aliases: ["controllership", "controller", "month end close", "month-end close", "general ledger", "reconciliation", "statutory reporting"], family: "finance", kind: "concept",
    what: "Producing accurate books — the month-end close, reconciliations and statutory reporting.",
    where: "All finance functions; distinct from FP&A, which looks forward.",
    screen: ["Ask their close timeline in days. Five days versus twenty says a lot about the rigour they're used to."],
    related: ["fpna", "indas"] },

  { id: "indas", label: "Ind AS / IFRS / GAAP", aliases: ["ind as", "indas", "ifrs", "gaap", "us gaap", "revenue recognition", "ind-as"], family: "finance", kind: "credential",
    what: "The accounting standards that dictate how results are reported. Ind AS is India's, converged with IFRS.",
    where: "Listed companies, subsidiaries of foreign parents, and anyone audited.",
    screen: ["Ask which standards they applied hands-on. Ind AS 115 (revenue) and 116 (leases) are the ones that bite."],
    related: ["controllership", "ca"] },

  { id: "ca", label: "CA / CPA", aliases: ["ca", "chartered accountant", "cpa", "acca", "icai", "cma"], ambiguous: ["ca"], family: "finance", kind: "credential",
    what: "Chartered Accountant (India), CPA (US) or ACCA — the professional qualifications for accounting roles.",
    where: "Usually mandatory for controllership, audit and senior finance roles in India.",
    screen: ["Ask attempt count and year of qualification only if the client requires it — many do, and it's better known upfront.", "\"CA Inter\" or \"CA (pursuing)\" is not qualified; check carefully, it is a frequent CV ambiguity."],
    related: ["indas", "controllership"] },

  { id: "gst", label: "GST / indirect tax", aliases: ["gst", "indirect tax", "tds", "transfer pricing", "taxation", "income tax"], family: "finance", kind: "concept",
    what: "India's Goods and Services Tax and related tax compliance, including TDS and transfer pricing for cross-border groups.",
    where: "Indian finance and tax teams.",
    screen: ["Ask whether they filed returns, handled assessments, or advised — three different depths."],
    related: ["ca", "indas"] },

  { id: "sapfico", label: "SAP FICO", aliases: ["sap fico", "fico", "sap fi", "sap co", "s/4hana finance"], family: "consulting", kind: "platform",
    what: "SAP's finance and controlling modules — the accounting core of an SAP installation.",
    where: "Large enterprises running SAP; a consulting specialism in its own right.",
    screen: ["Ask how many full implementations they've done end to end. Support work and implementation are different careers."],
    related: ["erp"] },

  // --- marketing --------------------------------------------------------------
  { id: "demandgen", label: "Demand generation", aliases: ["demand gen", "demand generation", "growth marketing", "performance marketing", "lead gen", "lead generation"], family: "marketing", kind: "concept",
    what: "Marketing that creates measurable pipeline, as opposed to brand work that builds awareness.",
    where: "B2B SaaS and anywhere marketing is held to a revenue number.",
    screen: ["Ask what pipeline they sourced and the budget they spent to get it. Without both numbers the claim is unfalsifiable."],
    related: ["cac", "abm"] },

  { id: "cac", label: "CAC / LTV / ROAS", aliases: ["cac", "ltv", "cac payback", "roas", "cpl", "cpa", "unit economics"], family: "marketing", kind: "metric",
    what: "Customer acquisition cost against lifetime value — whether a customer is worth more than they cost to win.",
    where: "Growth, performance marketing and any board deck.",
    screen: ["Ask their CAC payback period. Practitioners know it; people who ran campaigns without ownership don't."],
    related: ["demandgen"] },

  { id: "abm", label: "ABM", aliases: ["abm", "account based marketing", "account-based"], family: "marketing", kind: "method",
    what: "Account-based marketing — targeting a named list of companies rather than casting wide.",
    where: "Enterprise B2B, closely coupled to sales.",
    screen: ["Ask how many accounts and how they worked with sales. ABM without sales alignment is just advertising."],
    related: ["demandgen"] },

  { id: "seo", label: "SEO / SEM", aliases: ["seo", "sem", "search engine optimisation", "search engine optimization", "google ads", "ppc"], family: "marketing", kind: "concept",
    what: "Earning traffic from search results (SEO) or buying it (SEM/PPC).",
    where: "Consumer and B2B marketing alike.",
    screen: ["Ask for a traffic or ranking change they caused and over what period. SEO results take months — instant wins are suspicious."],
    related: ["cac"] },

  // --- consulting & implementation --------------------------------------------
  { id: "erp", label: "ERP", aliases: ["erp", "sap", "oracle erp", "netsuite", "dynamics", "s/4hana"], family: "consulting", kind: "platform",
    what: "Enterprise resource planning — the single system running finance, supply chain, HR and operations for a large company.",
    where: "Large enterprises. SAP and Oracle dominate; implementations run for years.",
    screen: ["Ask modules and number of end-to-end implementations, not years of experience.", "Distinguish functional consultants (business process) from technical (ABAP, integrations) — they are separate hires."],
    related: ["sapfico", "golive"] },

  { id: "golive", label: "Go-live / cutover", aliases: ["go live", "go-live", "cutover", "hypercare", "uat", "user acceptance testing", "rollout"], family: "implementation", kind: "concept",
    what: "The moment a new system replaces the old one. Cutover is the switch itself; hypercare is the intensive support right after; UAT is the customer's sign-off before it.",
    where: "Every ERP, CRM or platform implementation.",
    screen: ["Ask how many go-lives they've been through and what went wrong. Anyone who has done several will have a story ready.", "Being present at a go-live is different from owning the cutover plan — check which."],
    related: ["erp", "migration"] },

  { id: "migration", label: "Data migration", aliases: ["data migration", "migration", "legacy migration", "cutover data"], family: "implementation", kind: "concept",
    what: "Moving a customer's existing data into the new system — routinely the part of an implementation that slips.",
    where: "All implementations and platform replacements.",
    screen: ["Ask about record volumes and reconciliation. People who've done it talk about validation, not tooling."],
    related: ["golive", "erp"] },

  { id: "sow", label: "SOW / T&M vs fixed bid", aliases: ["sow", "statement of work", "time and material", "t&m", "fixed bid", "fixed price", "msa", "billability", "utilisation", "utilization"], family: "consulting", kind: "concept",
    what: "How consulting work is sold: time and materials bills by the hour, fixed bid commits to a price. Utilisation is the share of hours that are billable.",
    where: "Services firms and consultancies.",
    screen: ["Ask their utilisation target and whether they hit it — the core performance metric in services.", "Ask whether they've scoped an SOW or only delivered against one; scoping is a more senior skill."],
    related: ["erp", "golive"] },
];

/* A named technology ("Kafka") tells a recruiter more than a broad concept
   ("microservices"), so it leads the panel even when both appear once. */
const KIND_WEIGHT = { technology: 0.5, platform: 0.45, credential: 0.4, metric: 0.35, method: 0.3, concept: 0.1, term: 0.2 };

/* Alias lookup, built once. Longest aliases first so "account based marketing"
   is found before "abm" can match something inside it. */
const _byAlias = (() => {
  const pairs = [];
  for (const t of GLOSSARY) {
    const seen = new Set();
    for (const a of [t.label, ...t.aliases]) {
      const k = a.toLowerCase();
      if (seen.has(k)) continue; // label often repeats an alias — count it once
      seen.add(k);
      pairs.push([k, t]);
    }
  }
  return pairs.sort((x, y) => y[0].length - x[0].length);
})();

export const getTerm = (id) => GLOSSARY.find((t) => t.id === id) || null;

/* Whole-word/phrase matching. Substring matching is not usable here: "go" is
   inside "going", "ca" is inside "can", "ml" is inside "html" — every one of
   which would fire on an ordinary JD. */
function mentions(haystackPadded, alias) {
  const idx = haystackPadded.indexOf(` ${alias} `);
  return idx !== -1;
}

/* Which known terms does this text actually talk about? Returns terms ordered
   by how prominent they are in the text, so the panel leads with what the JD
   is really about rather than the first thing it happened to mention. */
export function detectTerms(text, { limit = 12, family = null } = {}) {
  const clean = (" " + String(text || "").toLowerCase() + " ")
    .replace(/[^a-z0-9&#.+/'-]+/g, " ")
    /* Dots, slashes and apostrophes are kept above because ".net", "s/4hana"
       and "president's" need them — but a trailing one is sentence punctuation,
       and it was hiding every term that ended a sentence ("...with Terraform.").
       # and + stay put, or c# and c++ would lose their names. */
    .replace(/([a-z0-9])[.'/-]+(?=\s)/g, "$1 ")
    .replace(/\s+/g, " ");
  if (clean.trim().length < 2) return [];
  const hits = new Map();
  for (const [alias, term] of _byAlias) {
    if (!mentions(clean, alias)) continue;
    const count = clean.split(` ${alias} `).length - 1;
    // An alias flagged ambiguous only counts as real evidence within its own
    // craft: an engineering JD saying "event pipeline" is not talking about a
    // sales funnel, and "go live" is not the Go language.
    const weak = (term.ambiguous || []).includes(alias);
    const prev = hits.get(term.id);
    if (prev) { prev.weight += count; prev.strong = prev.strong || !weak; }
    else hits.set(term.id, { term, weight: count + alias.length / 100 + (KIND_WEIGHT[term.kind] ?? 0.2), strong: !weak });
  }
  return [...hits.values()]
    .filter((h) => h.strong || !family || h.term.family === family)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((h) => h.term);
}
