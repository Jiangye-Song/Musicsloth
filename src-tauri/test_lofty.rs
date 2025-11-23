use lofty::{Probe, Accessor};

fn main() {
    let path = r"C:\Users\songj\Desktop\1\阳光彩虹小白马 - 大张伟.mp3";
    
    match Probe::open(path).and_then(|p| p.read()) {
        Ok(tagged_file) => {
            println!("File read successfully!");
            
            if let Some(tag) = tagged_file.primary_tag() {
                println!("Primary tag type: {:?}", tag.tag_type());
                println!("Title: {:?}", tag.title());
                println!("Artist: {:?}", tag.artist());
                println!("Album: {:?}", tag.album());
                println!("Genre: {:?}", tag.genre());
                
                println!("\nAll text frames:");
                for item in tag.items() {
                    println!("{:?}: {:?}", item.key(), item.value());
                }
            } else {
                println!("No primary tag found");
            }
            
            println!("\nAll tags:");
            for tag in tagged_file.tags() {
                println!("Tag type: {:?}", tag.tag_type());
            }
        }
        Err(e) => {
            eprintln!("Error reading file: {}", e);
        }
    }
}
