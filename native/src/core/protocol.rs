#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum Protocol {
    Tcp,
    Udp,
    All,
}

impl Protocol {
    pub fn parse(value: &str) -> Result<Self, String> {
        match value.to_ascii_lowercase().as_str() {
            "tcp" => Ok(Self::Tcp),
            "udp" => Ok(Self::Udp),
            "all" => Ok(Self::All),
            _ => Err(format!("invalid protocol: {value}")),
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Udp => "udp",
            Self::All => "all",
        }
    }

    pub fn matches(self, protocol: ProcessProtocol) -> bool {
        match self {
            Self::Tcp => protocol == ProcessProtocol::Tcp,
            Self::Udp => protocol == ProcessProtocol::Udp,
            Self::All => true,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd)]
pub enum ProcessProtocol {
    Tcp,
    Udp,
}

impl ProcessProtocol {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Udp => "udp",
        }
    }
}
