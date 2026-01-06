import React, {useState, useEffect} from 'react'

function Update(data){
    const shopData = data.Data;
    console.log("Recieved data in Update",shopData)
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if(shopData){
            setLoading(false);
        }
    }, [])

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading shop data...</p>
            </div>
        );
    }

    if (!shopData) {
        return (
            <div className="error-container">
                <p>No shop data found. Please login again.</p>
            </div>
        );
    }


    return (
        <div>Update</div>
    )
}

export default Update