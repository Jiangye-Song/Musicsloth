/// Utility functions for parsing multi-value metadata fields

use regex::Regex;
use std::sync::OnceLock;

/// Get the regex pattern for splitting multi-value fields
fn get_separator_regex() -> &'static Regex {
    static REGEX: OnceLock<Regex> = OnceLock::new();
    REGEX.get_or_init(|| {
        // Match any of: comma, semicolon, slash, pipe, ideographic comma, ampersand, 
        // "ft.", "feat.", "featuring"
        Regex::new(r#"[,;/|、&]|\s+(?:ft\.?|feat\.?|featuring)\s+"#).unwrap()
    })
}

/// Parse a multi-value field (artist or genre) into individual values
/// 
/// Splits on: `, ; / | 、 & ft. feat. featuring`
/// 
/// # Examples
/// ```
/// let artists = parse_multi_value("Artist A, Artist B & Artist C");
/// assert_eq!(artists, vec!["Artist A", "Artist B", "Artist C"]);
/// 
/// let genres = parse_multi_value("Rock; Blues / Jazz");
/// assert_eq!(genres, vec!["Rock", "Blues", "Jazz"]);
/// ```
pub fn parse_multi_value(value: &str) -> Vec<String> {
    if value.is_empty() {
        return vec![];
    }

    let regex = get_separator_regex();
    
    regex
        .split(value)
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

/// Parse artist field, returning a list of individual artists
pub fn parse_artists(artist: &str) -> Vec<String> {
    parse_multi_value(artist)
}

/// Parse genre field, returning a list of individual genres
pub fn parse_genres(genre: &str) -> Vec<String> {
    parse_multi_value(genre)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_comma_separator() {
        assert_eq!(
            parse_multi_value("Artist A, Artist B, Artist C"),
            vec!["Artist A", "Artist B", "Artist C"]
        );
    }

    #[test]
    fn test_semicolon_separator() {
        assert_eq!(
            parse_multi_value("Rock; Blues; Jazz"),
            vec!["Rock", "Blues", "Jazz"]
        );
    }

    #[test]
    fn test_ampersand_separator() {
        assert_eq!(
            parse_multi_value("Artist A & Artist B"),
            vec!["Artist A", "Artist B"]
        );
    }

    #[test]
    fn test_ft_separator() {
        assert_eq!(
            parse_multi_value("Artist A ft. Artist B"),
            vec!["Artist A", "Artist B"]
        );
        assert_eq!(
            parse_multi_value("Artist A feat. Artist B"),
            vec!["Artist A", "Artist B"]
        );
        assert_eq!(
            parse_multi_value("Artist A featuring Artist B"),
            vec!["Artist A", "Artist B"]
        );
    }

    #[test]
    fn test_mixed_separators() {
        assert_eq!(
            parse_multi_value("Artist A, Artist B & Artist C ft. Artist D"),
            vec!["Artist A", "Artist B", "Artist C", "Artist D"]
        );
    }

    #[test]
    fn test_japanese_comma() {
        assert_eq!(
            parse_multi_value("アーティストA、アーティストB"),
            vec!["アーティストA", "アーティストB"]
        );
    }

    #[test]
    fn test_slash_pipe_separators() {
        assert_eq!(
            parse_multi_value("Rock / Metal | Blues"),
            vec!["Rock", "Metal", "Blues"]
        );
    }

    #[test]
    fn test_empty_string() {
        assert_eq!(parse_multi_value(""), Vec::<String>::new());
    }

    #[test]
    fn test_single_value() {
        assert_eq!(parse_multi_value("Single Artist"), vec!["Single Artist"]);
    }

    #[test]
    fn test_whitespace_trimming() {
        assert_eq!(
            parse_multi_value("  Artist A  ,  Artist B  "),
            vec!["Artist A", "Artist B"]
        );
    }
}
